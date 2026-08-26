"""운영 대시보드 API (FR-13/17, API명세서 v1.3 · 4.9). 매니저 전용.

orders/order_item/inventory 각각을 조회해 Python에서 조합한다. 시드 규모(매장당
상품 119종 · 전체 주문 96건)에서는 별도 SQL 뷰·RPC 없이도 충분히 가볍다.
"""

from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, Query

from app.api.routes.inventory import _baseline_map, _remaining_pct, _stock_status
from app.core.deps import StaffContext, require_manager
from app.core.formatting import item_summary
from app.core.metrics import change_pct, share_pct
from app.core.supabase_client import fetch_all, get_supabase
from app.core.timeutil import DateRange, previous_period, resolve_period, to_kst
from app.schemas.dashboard import (
    DashboardKpi,
    DashboardOverviewResponse,
    LowStockItem,
    RecentOrder,
    SalesChart,
    SalesChartPoint,
    TopProduct,
    TopProductsOthers,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
logger = structlog.get_logger("app.dashboard")


def _low_stock(store_id: int, limit: int | None = None) -> tuple[list[LowStockItem], int]:
    """LOW/OUT 상태 재고를 remaining_qty 오름차순으로. GET /inventory와 같은 계산 로직을 재사용한다."""
    supabase = get_supabase()
    baseline_map = _baseline_map(store_id)
    rows = (
        supabase.table("inventory")
        .select("product_id, produced_qty, remaining_qty, product!inner(product_name)")
        .eq("store_id", store_id)
        .execute()
        .data
    )
    items: list[LowStockItem] = []
    for row in rows:
        baseline = baseline_map.get(row["product_id"], 20)
        pct = _remaining_pct(row["remaining_qty"], row["produced_qty"])
        if _stock_status(row["remaining_qty"], pct, baseline) in ("LOW", "OUT"):
            items.append(
                LowStockItem(
                    product_id=row["product_id"],
                    product_name=row["product"]["product_name"],
                    remaining_qty=row["remaining_qty"],
                    produced_qty=row["produced_qty"],
                    stock_baseline_pct=baseline,
                )
            )
    items.sort(key=lambda it: it.remaining_qty)
    total = len(items)
    return (items[:limit] if limit else items), total


def _fetch_orders(store_id: int, rng: DateRange) -> list[dict]:
    supabase = get_supabase()
    return fetch_all(
        lambda: (
            supabase.table("orders")
            .select("order_id, ordered_at, paid_at, total_amount")
            .eq("store_id", store_id)
            .eq("status", "PAID")
            .gte("paid_at", rng.start_utc.isoformat())
            .lt("paid_at", rng.end_utc_exclusive.isoformat())
        ),
        order_by="order_id",
    )


def _fetch_order_items(store_id: int, rng: DateRange) -> list[dict]:
    """주문 ID 목록을 .in_()으로 넘기지 않는다 - PostgREST는 그 값을 전부 GET
    쿼리스트링에 싣기 때문에 30일치(수천 건)면 URL이 nginx 헤더 버퍼(8KB)를 넘겨
    414로 거부된다. ORDERS를 조인해 같은 기간 조건을 걸면 URL이 짧게 유지된다."""
    supabase = get_supabase()
    return fetch_all(
        lambda: (
            supabase.table("order_item")
            .select(
                "order_id, product_id, quantity, product!inner(product_name),"
                " orders!inner(store_id, status, paid_at)"
            )
            .eq("orders.store_id", store_id)
            .eq("orders.status", "PAID")
            .gte("orders.paid_at", rng.start_utc.isoformat())
            .lt("orders.paid_at", rng.end_utc_exclusive.isoformat())
        ),
        order_by="order_item_id",
    )


def _totals(orders: list[dict], order_items: list[dict]) -> tuple[int, int, int]:
    """(매출, 결제 건수, 판매 수량). 현재 기간과 직전 기간에 똑같이 쓴다."""
    return (
        sum(int(round(float(o["total_amount"]))) for o in orders),
        len(orders),
        sum(oi["quantity"] for oi in order_items),
    )


@router.get("/overview", response_model=DashboardOverviewResponse)
def get_overview(
    period: str = Query(default="TODAY", pattern="^(TODAY|7D|30D)$"),
    staff: StaffContext = Depends(require_manager),
):
    """운영 현황 화면 전체를 한 번에 채운다(API명세서 v1.3 · 4.9)."""
    rng = resolve_period(period)
    prev_rng = previous_period(rng)

    orders = _fetch_orders(staff.store_id, rng)
    order_items = _fetch_order_items(staff.store_id, rng)

    items_by_order: dict[int, list[dict]] = defaultdict(list)
    for oi in order_items:
        items_by_order[oi["order_id"]].append(oi)

    sales_amount, order_count, item_qty = _totals(orders, order_items)
    prev_sales, prev_order_cnt, prev_qty = _totals(
        _fetch_orders(staff.store_id, prev_rng),
        _fetch_order_items(staff.store_id, prev_rng),
    )
    low_stock_items, low_stock_count = _low_stock(staff.store_id, limit=6)

    kpi = DashboardKpi(
        sales_amount=sales_amount,
        order_count=order_count,
        item_qty=item_qty,
        correction_rate=0.0,
        low_stock_count=low_stock_count,
        prev_sales_amount=prev_sales,
        prev_order_count=prev_order_cnt,
        prev_item_qty=prev_qty,
        sales_change_pct=change_pct(sales_amount, prev_sales),
        order_change_pct=change_pct(order_count, prev_order_cnt),
        item_change_pct=change_pct(item_qty, prev_qty),
    )

    # sales_chart: TODAY는 KST 시간대별, 그 외는 일자별
    unit = "HOUR" if period == "TODAY" else "DAY"
    bucket_totals: dict[str, int] = defaultdict(int)
    bucket_orders: dict[str, int] = defaultdict(int)
    for o in orders:
        paid_at_kst = to_kst(datetime.fromisoformat(o["paid_at"]))
        label = str(paid_at_kst.hour) if unit == "HOUR" else paid_at_kst.date().isoformat()
        bucket_totals[label] += int(round(float(o["total_amount"])))
        bucket_orders[label] += 1

    if unit == "HOUR":
        chart_labels = [str(h) for h in range(8, 23)]
    else:
        chart_labels = [
            (rng.start_date + timedelta(days=d)).isoformat() for d in range(rng.days)
        ]
    sales_chart = SalesChart(
        unit=unit,
        points=[
            SalesChartPoint(
                label=label,
                amount=bucket_totals.get(label, 0),
                order_count=bucket_orders.get(label, 0),
            )
            for label in chart_labels
        ],
    )

    # top_products: 판매수량 상위 5 + 나머지는 "기타"로 묶는다(목업 도넛).
    qty_by_product: Counter[int] = Counter()
    name_by_product: dict[int, str] = {}
    for oi in order_items:
        qty_by_product[oi["product_id"]] += oi["quantity"]
        name_by_product[oi["product_id"]] = oi["product"]["product_name"]

    ranked = qty_by_product.most_common(5)
    top_products = [
        TopProduct(
            product_id=pid,
            product_name=name_by_product[pid],
            sold_qty=qty,
            share_pct=share_pct(qty, item_qty),
        )
        for pid, qty in ranked
    ]
    others_qty = item_qty - sum(qty for _, qty in ranked)
    top_products_others = TopProductsOthers(
        product_count=max(len(qty_by_product) - len(ranked), 0),
        sold_qty=others_qty,
        share_pct=share_pct(others_qty, item_qty),
    )

    # recent_orders: 최근 6건
    recent_orders = [
        RecentOrder(
            order_id=o["order_id"],
            ordered_at=o["ordered_at"],
            item_summary=item_summary(
                [it["product"]["product_name"] for it in items_by_order.get(o["order_id"], [])]
            ),
            item_count=sum(it["quantity"] for it in items_by_order.get(o["order_id"], [])),
            total_amount=int(round(float(o["total_amount"]))),
        )
        for o in sorted(orders, key=lambda o: o["ordered_at"], reverse=True)[:6]
    ]

    return DashboardOverviewResponse(
        period=period,
        kpi=kpi,
        sales_chart=sales_chart,
        top_products=top_products,
        top_products_others=top_products_others,
        recent_orders=recent_orders,
        low_stock=low_stock_items,
        updated_at=datetime.now(UTC),
    )
