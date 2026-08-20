from datetime import datetime

from pydantic import BaseModel


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
