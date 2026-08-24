from datetime import date

from pydantic import BaseModel


class SalesStatItem(BaseModel):
    """GET /api/stats/sales 목록 1건 (API명세서 v1.3 · 4.9).

    group_by에 따라 채워지는 필드가 다르다: PRODUCT는 product_id/product_name/category,
    CATEGORY는 category만, DAY는 stat_date만 의미 있는 값을 가진다.
    """

    product_id: int | None = None
    product_name: str | None = None
    category: str | None = None
    stat_date: date | None = None
    sold_qty: int
    sales_amount: int
    prev_sold_qty: int
    change_pct: float


class SalesSummary(BaseModel):
    sales_amount: int
    order_count: int
    item_qty: int


class SalesStatsResponse(BaseModel):
    period: str
    timezone: str = "Asia/Seoul"
    items: list[SalesStatItem]
    total: int
    limit: int
    offset: int
    summary: SalesSummary
