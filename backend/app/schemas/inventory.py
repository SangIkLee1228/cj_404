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
    # 재고 조정 모달의 썸네일용. GET /products와 동일하게 PRODUCT.image_url을 그대로 준다.
    # 현재 값은 public 버킷의 완전한 URL이라 FE가 바로 <img src>에 쓸 수 있다
    # (API명세서 4.3은 비공개 버킷+서명 URL을 전제하는데 실제 상품 이미지는 공개 경로에 있다 - storage 쪽 불일치).
    # 121종 중 91종만 값이 있어 나머지는 None이다. FE는 placeholder를 준비할 것.
    image_url: str | None = None
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
    """PATCH /api/inventory/{product_id}/restock 요청. 보충 이력은 남기지 않는다(DB설계서 v2.2 · 4.13).

    필드가 qty 하나뿐인 것은 확정된 결정이다(2026-08-26):
    - **조정 사유 없음** - 목업 모달의 "조정 사유" 드롭다운은 목업에서 제거하기로 했다.
      받아봤자 저장할 곳이 없다(INVENTORY_RESTOCK_LOG는 DB설계서 13장 향후 확장).
    - **감소 조정 없음** - 폐기·차감 시나리오는 범위 밖이라 ge=1로 증가만 허용한다.
    """

    qty: int = Field(ge=1, le=999)


class RestockResponse(BaseModel):
    product_id: int
    produced_qty: int
    remaining_qty: int
    stock_status: StockStatus
