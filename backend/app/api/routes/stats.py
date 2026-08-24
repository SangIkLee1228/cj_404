"""판매 통계 API (FR-17, API명세서 v1.3 · 4.9). 매니저 전용.

SALES_STAT_DAILY(일별 배치 집계, DB설계서 v2.2 · 4.15)를 group_by 기준으로
Python에서 재집계한다. stat_date는 date 타입이라 timestamptz 이슈 없이 KST
날짜 그대로 비교할 수 있다(DB설계서 8-3).
"""

from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.core.deps import StaffContext, require_manager
from app.core.supabase_client import get_supabase
from app.core.timeutil import KST, previous_period, resolve_period
from app.schemas.stats import SalesStatItem, SalesStatsResponse, SalesSummary

router = APIRouter(prefix="/stats", tags=["stats"])

_SELECT = "product_id, stat_date, sold_qty, sales_amount, product!inner(product_name, category, product_type)"


def _fetch_rows(
    store_id: int, start: date, end: date, product_type: str | None
) -> list[dict]:
    supabase = get_supabase()
    query = (
        supabase.table("sales_stat_daily")
        .select(_SELECT)
        .eq("store_id", store_id)
        .gte("stat_date", start.isoformat())
        .lte("stat_date", end.isoformat())
    )
    if product_type:
        query = query.eq("product.product_type", product_type)
    return query.execute().data


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


def _change_pct(current: int, previous: int) -> float:
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return round((current - previous) / previous * 100, 1)


def _order_summary(store_id: int, start: date, end: date) -> SalesSummary:
    """summary.order_count는 SALES_STAT_DAILY에 없는 정보라 ORDERS를 별도 집계한다."""
    supabase = get_supabase()
    start_utc = datetime.combine(start, time.min, tzinfo=KST).astimezone(UTC)
    end_utc = datetime.combine(end + timedelta(days=1), time.min, tzinfo=KST).astimezone(UTC)

    orders = (
        supabase.table("orders")
        .select("total_amount", count="exact")
        .eq("store_id", store_id)
        .eq("status", "PAID")
        .gte("paid_at", start_utc.isoformat())
        .lt("paid_at", end_utc.isoformat())
        .execute()
    )
    sales_amount = sum(int(round(float(o["total_amount"]))) for o in orders.data)
    return SalesSummary(sales_amount=sales_amount, order_count=orders.count or 0, item_qty=0)


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

    current_rows = _fetch_rows(staff.store_id, rng.start_date, rng.end_date, product_type)
    previous_rows = _fetch_rows(staff.store_id, prev_rng.start_date, prev_rng.end_date, product_type)

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
            change_pct=_change_pct(bucket["sold_qty"], previous_grouped.get(key, {}).get("sold_qty", 0)),
        )
        for key, bucket in current_grouped.items()
    ]
    items.sort(key=lambda it: it.sold_qty, reverse=True)

    total = len(items)
    page = items[offset : offset + limit]

    summary = _order_summary(staff.store_id, rng.start_date, rng.end_date)
    summary.item_qty = sum(bucket["sold_qty"] for bucket in current_grouped.values())

    return SalesStatsResponse(
        period=period,
        items=page,
        total=total,
        limit=limit,
        offset=offset,
        summary=summary,
    )
