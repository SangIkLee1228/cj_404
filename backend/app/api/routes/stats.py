"""판매 통계 API (FR-17, API명세서 v1.3 · 4.9). 매니저 전용.

SALES_STAT_DAILY(일별 배치 집계, DB설계서 v2.2 · 4.15)를 group_by 기준으로
Python에서 재집계한다. stat_date는 date 타입이라 timestamptz 이슈 없이 KST
날짜 그대로 비교할 수 있다(DB설계서 8-3).

이 API는 목업에 대응 화면이 아직 없다(목업의 "판매 통계" 페이지는 주문 단위 표라
GET /orders 쪽이다). 화면을 재정의할 예정이라 유지한다 - 폐기하지 말 것(2026-08-26 결정).

items와 summary는 반드시 같은 SALES_STAT_DAILY 행 집합에서 나와야 한다 - 두 소스를
섞으면 "매출 152만원인데 판매수량 9,030개" 같은 앞뒤 안 맞는 응답이 나간다.
예외는 summary.order_count 하나뿐인데, 상품×일자 집계에는 주문 건수를 복원할 정보가
없어 ORDERS를 따로 센다(아래 _order_count 주석 참고).
"""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.core.deps import StaffContext, require_manager
from app.core.metrics import change_pct
from app.core.supabase_client import fetch_all, get_supabase
from app.core.timeutil import DateRange, previous_period, resolve_period
from app.schemas.stats import SalesStatItem, SalesStatsResponse, SalesSummary

router = APIRouter(prefix="/stats", tags=["stats"])

_SELECT = "product_id, stat_date, sold_qty, sales_amount, product!inner(product_name, category, product_type)"

def _fetch_rows(store_id: int, rng: DateRange, product_type: str | None) -> list[dict]:
    """기간 내 전 행. SALES_STAT_DAILY는 상품×일자라 30일 조회가 3,500행을 넘어
    fetch_all 없이는 1000행에서 조용히 잘린다."""
    supabase = get_supabase()

    def build():
        query = (
            supabase.table("sales_stat_daily")
            .select(_SELECT)
            .eq("store_id", store_id)
            .gte("stat_date", rng.start_date.isoformat())
            .lte("stat_date", rng.end_date.isoformat())
        )
        return query.eq("product.product_type", product_type) if product_type else query

    return fetch_all(build, order_by="stat_id")


def _group_key(row: dict, group_by: str) -> Any:
    if group_by == "PRODUCT":
        return row["product_id"]
    if group_by == "CATEGORY":
        return row["product"].get("category")
    return row["stat_date"]  # DAY


def _aggregate(rows: list[dict], group_by: str) -> dict[Any, dict]:
    grouped: dict[Any, dict] = {}
    for row in rows:
        key = _group_key(row, group_by)
        bucket = grouped.setdefault(
            key,
            {
                "product_id": row["product_id"] if group_by == "PRODUCT" else None,
                "product_name": row["product"]["product_name"] if group_by == "PRODUCT" else None,
                "category": row["product"].get("category") if group_by in ("PRODUCT", "CATEGORY") else None,
                "stat_date": row["stat_date"] if group_by == "DAY" else None,
                "sold_qty": 0,
                "sales_amount": 0,
            },
        )
        bucket["sold_qty"] += row["sold_qty"]
        bucket["sales_amount"] += int(round(float(row["sales_amount"])))
    return grouped


def _order_count(store_id: int, rng: DateRange) -> int:
    """결제 건수만 ORDERS에서 센다.

    SALES_STAT_DAILY는 상품×일자 집계라 "몇 건의 주문이었나"를 복원할 수 없다 -
    한 주문에 상품 3종이 담기면 3행으로 흩어지고, 같은 상품을 산 두 주문은 1행으로 합쳐진다.
    금액·수량과 달리 이 값만 ORDERS를 봐야 하는 이유다.
    """
    supabase = get_supabase()
    result = (
        supabase.table("orders")
        .select("order_id", count="exact")
        .eq("store_id", store_id)
        .eq("status", "PAID")
        .gte("paid_at", rng.start_utc.isoformat())
        .lt("paid_at", rng.end_utc_exclusive.isoformat())
        .execute()
    )
    return result.count or 0


def _summary(rows: list[dict], store_id: int, rng: DateRange) -> SalesSummary:
    """items를 만든 것과 **같은** 행에서 매출·수량을 합산한다(API명세서 4.9: 조회 기간 전체 기준).

    반올림도 _aggregate와 동일하게 행 단위로 해야 items 합계와 summary가 1원도 어긋나지 않는다.
    """
    return SalesSummary(
        sales_amount=sum(int(round(float(r["sales_amount"]))) for r in rows),
        order_count=_order_count(store_id, rng),
        item_qty=sum(r["sold_qty"] for r in rows),
    )


@router.get("/sales", response_model=SalesStatsResponse)
def get_sales_stats(
    period: str = Query(default="7D", pattern="^(TODAY|7D|30D)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: str = Query(default="PRODUCT", pattern="^(PRODUCT|CATEGORY|DAY)$"),
    product_type: str | None = Query(default=None, pattern="^(BREAD|DRINK)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    staff: StaffContext = Depends(require_manager),
):
    """기간별 품목 판매 통계 (S-07 화면)."""
    rng = resolve_period(period, date_from, date_to)
    prev_rng = previous_period(rng)

    current_rows = _fetch_rows(staff.store_id, rng, product_type)
    previous_rows = _fetch_rows(staff.store_id, prev_rng, product_type)

    current_grouped = _aggregate(current_rows, group_by)
    previous_grouped = _aggregate(previous_rows, group_by)

    items = [
        SalesStatItem(
            product_id=bucket["product_id"],
            product_name=bucket["product_name"],
            category=bucket["category"],
            stat_date=bucket["stat_date"],
            sold_qty=bucket["sold_qty"],
            sales_amount=bucket["sales_amount"],
            prev_sold_qty=previous_grouped.get(key, {}).get("sold_qty", 0),
            change_pct=change_pct(bucket["sold_qty"], previous_grouped.get(key, {}).get("sold_qty", 0)),
        )
        for key, bucket in current_grouped.items()
    ]
    items.sort(key=lambda it: it.sold_qty, reverse=True)

    total = len(items)
    page = items[offset : offset + limit]

    return SalesStatsResponse(
        period=period,
        items=page,
        total=total,
        limit=limit,
        offset=offset,
        summary=_summary(current_rows, staff.store_id, rng),
    )
