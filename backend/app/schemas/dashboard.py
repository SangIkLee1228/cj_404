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

    # 목업 KPI 카드의 "▼5.0% 전 기간 대비". 비교 대상은 직전 동일 길이 기간이며
    # (오늘↔어제, 최근 7일↔그 이전 7일) 판매 통계의 change_pct와 같은 규칙을 쓴다.
    prev_sales_amount: int = 0
    prev_order_count: int = 0
    prev_item_qty: int = 0
    sales_change_pct: float = 0.0
    order_change_pct: float = 0.0
    item_change_pct: float = 0.0


class SalesChartPoint(BaseModel):
    """목업 그래프는 막대=매출(원) + 꺾은선=결제 건수의 이중축이라 두 값이 다 필요하다."""

    label: str
    amount: int
    order_count: int = 0


class SalesChart(BaseModel):
    unit: Literal["HOUR", "DAY"]
    points: list[SalesChartPoint]


class TopProduct(BaseModel):
    product_id: int
    product_name: str
    sold_qty: int
    share_pct: float = 0.0


class TopProductsOthers(BaseModel):
    """목업 도넛의 '기타' 조각 - 상위 5개에 들지 못한 나머지 상품 전부를 묶은 것.

    도넛 중앙에 찍히는 전체 판매 수량은 kpi.item_qty와 같은 값이라 따로 내려주지 않는다.
    """

    product_count: int
    sold_qty: int
    share_pct: float = 0.0


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
    top_products_others: TopProductsOthers
    recent_orders: list[RecentOrder]
    low_stock: list[LowStockItem]
    updated_at: datetime
