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
from app.core.supabase_client import get_supabase
from app.core.timeutil import resolve_period, to_kst
from app.schemas.dashboard import (
    DashboardKpi,
    DashboardOverviewResponse,
    LowStockItem,
    RecentOrder,
    SalesChart,
    SalesChartPoint,
    TopProduct,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
logger = structlog.get_logger("app.dashboard")


def _item_summary(product_names: list[str]) -> str:
    """"카라멜 크림빵, 소금빵 외 1" 패턴 (API명세서 v1.3 · 4.5 예시와 동일 규칙)."""
    if not product_names:
        return ""
    if len(product_names) <= 2:
        return ", ".join(product_names)
    return f"{', '.join(product_names[:2])} 외 {len(product_names) - 2}"


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


@router.get("/overview", response_model=DashboardOverviewResponse)
def get_overview(
    period: str = Query(default="TODAY", pattern="^(TODAY|7D|30D)$"),
    staff: StaffContext = Depends(require_manager),
):
    """운영 현황 화면 전체를 한 번에 채운다(API명세서 v1.3 · 4.9)."""
    supabase = get_supabase()
    rng = resolve_period(period)

    orders = (
        supabase.table("orders")
        .select("order_id, ordered_at, paid_at, total_amount")
        .eq("store_id", staff.store_id)
        .eq("status", "PAID")
        .gte("paid_at", rng.start_utc.isoformat())
        .lt("paid_at", rng.end_utc_exclusive.isoformat())
        .execute()
        .data
    )
    order_ids = [o["order_id"] for o in orders]

    order_items: list[dict] = []
    if order_ids:
        order_items = (
            supabase.table("order_item")
            .select("order_id, product_id, quantity, product!inner(product_name)")
            .in_("order_id", order_ids)
            .execute()
            .data
        )

    items_by_order: dict[int, list[dict]] = defaultdict(list)
    for oi in order_items:
        items_by_order[oi["order_id"]].append(oi)

    sales_amount = sum(int(round(float(o["total_amount"]))) for o in orders)
    item_qty = sum(oi["quantity"] for oi in order_items)
    low_stock_items, low_stock_count = _low_stock(staff.store_id, limit=6)

    kpi = DashboardKpi(
        sales_amount=sales_amount,
        order_count=len(orders),
        item_qty=item_qty,
        correction_rate=0.0,
        low_stock_count=low_stock_count,
    )

    # sales_chart: TODAY는 KST 시간대별, 그 외는 일자별
    unit = "HOUR" if period == "TODAY" else "DAY"
    bucket_totals: dict[str, int] = defaultdict(int)
    for o in orders:
        paid_at_kst = to_kst(datetime.fromisoformat(o["paid_at"]))
        label = str(paid_at_kst.hour) if unit == "HOUR" else paid_at_kst.date().isoformat()
        bucket_totals[label] += int(round(float(o["total_amount"])))

    if unit == "HOUR":
        chart_labels = [str(h) for h in range(8, 23)]
    else:
        chart_labels = [
            (rng.start_date + timedelta(days=d)).isoformat() for d in range(rng.days)
        ]
    sales_chart = SalesChart(
        unit=unit,
        points=[SalesChartPoint(label=label, amount=bucket_totals.get(label, 0)) for label in chart_labels],
    )

    # top_products: 판매수량 상위 5
    qty_by_product: Counter[int] = Counter()
    name_by_product: dict[int, str] = {}
    for oi in order_items:
        qty_by_product[oi["product_id"]] += oi["quantity"]
        name_by_product[oi["product_id"]] = oi["product"]["product_name"]
    top_products = [
        TopProduct(product_id=pid, product_name=name_by_product[pid], sold_qty=qty)
        for pid, qty in qty_by_product.most_common(5)
    ]

    # recent_orders: 최근 6건
    recent_orders = [
        RecentOrder(
            order_id=o["order_id"],
            ordered_at=o["ordered_at"],
            item_summary=_item_summary(
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
        recent_orders=recent_orders,
        low_stock=low_stock_items,
        updated_at=datetime.now(UTC),
    )
