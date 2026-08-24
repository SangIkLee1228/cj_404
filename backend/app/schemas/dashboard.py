from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DashboardKpi(BaseModel):
    """CORRECTION_LOG 실사용은 2차 범위라 correction_rate는 명세서 그대로 0.0 고정(API명세서 v1.3 · 7장)."""

    sales_amount: int
    order_count: int
    item_qty: int
    correction_rate: float = 0.0
    low_stock_count: int


class SalesChartPoint(BaseModel):
    label: str
    amount: int


class SalesChart(BaseModel):
    unit: Literal["HOUR", "DAY"]
    points: list[SalesChartPoint]


class TopProduct(BaseModel):
    product_id: int
    product_name: str
    sold_qty: int


class RecentOrder(BaseModel):
    order_id: int
    ordered_at: datetime
    item_summary: str
    item_count: int
    total_amount: int


class LowStockItem(BaseModel):
    product_id: int
    product_name: str
    remaining_qty: int
    produced_qty: int
    stock_baseline_pct: int


class DashboardOverviewResponse(BaseModel):
    """GET /api/dashboard/overview 응답 (API명세서 v1.3 · 4.9). 요약 대시보드라
    페이지네이션 없이 top_products/recent_orders/low_stock 각각 상위 N건만 내려준다."""

    period: str
    timezone: str = "Asia/Seoul"
    kpi: DashboardKpi
    sales_chart: SalesChart
    top_products: list[TopProduct]
    recent_orders: list[RecentOrder]
    low_stock: list[LowStockItem]
    updated_at: datetime
