from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.codes import ProductType


class Inventory(BaseModel):
    """매장×상품 조합당 1행의 재고 스냅샷 (FR-12/13).

    참고 정보일 뿐이며 자동 발주로 이어지지 않는다(NFR-07). remaining_qty는
    produced_qty - sold_qty와 항상 일치하도록 애플리케이션/트리거에서 유지한다.
    """

    inventory_id: int
    store_id: int
    product_id: int
    produced_qty: int = 0
    sold_qty: int = 0
    remaining_qty: int = 0
    updated_at: datetime


StockStatus = Literal["OK", "LOW", "OUT"]


class InventoryListItem(BaseModel):
    """GET /api/inventory 목록 1건 (API명세서 v1.3 · 4.7).

    remaining_pct/stock_status는 INVENTORY의 실컬럼이 아니라 STORE_PRODUCT.stock_baseline_pct
    대비로 서버가 매 요청 계산한다.
    """

    product_id: int
    product_name: str
    product_type: ProductType
    category: str | None = None
    produced_qty: int
    sold_qty: int
    remaining_qty: int
    remaining_pct: float
    stock_baseline_pct: int
    stock_status: StockStatus
    updated_at: datetime


class InventoryListResponse(BaseModel):
    items: list[InventoryListItem]
    total: int
    limit: int
    offset: int
    updated_at: datetime


class RestockRequest(BaseModel):
    """PATCH /api/inventory/{product_id}/restock 요청. 보충 이력은 남기지 않는다(DB설계서 v2.2 · 4.13)."""

    qty: int = Field(ge=1, le=999)


class RestockResponse(BaseModel):
    product_id: int
    produced_qty: int
    remaining_qty: int
    stock_status: StockStatus
