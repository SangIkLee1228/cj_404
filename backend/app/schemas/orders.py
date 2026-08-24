from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.codes import OrderItemSourceType, OrderStatus, PaymentMethod, PointTxnType


class Order(BaseModel):
    """ORDERS 행 (테이블명 예약어 회피). 결제 시점의 멤버십 등급을 applied_grade_id로 스냅샷한다.

    금액 항등식(API명세서 v1.2 · 1.5, DB CHECK 제약으로도 강제됨):
        gross_amount   = SUM(order_item.subtotal)
        discount_amount = membership_discount_amount + manual_discount_amount
        total_amount   = gross_amount - discount_amount

    scan_session은 ORDERS가 아니라 SCAN_SESSION.order_id로 연결된다(1:N).
    한 주문에 기본 촬영 + 추가 촬영 + 재촬영이 여러 건 붙을 수 있기 때문이다.
    """

    order_id: int
    store_id: int
    staff_id: int
    member_id: int | None = None
    applied_grade_id: int | None = None
    status: OrderStatus = "PENDING"
    payment_method: PaymentMethod | None = None
    gross_amount: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    membership_discount_amount: Decimal = Decimal("0")
    manual_discount_amount: Decimal = Decimal("0")
    manual_discount_reason: str | None = None
    manual_discount_staff_id: int | None = None
    total_amount: Decimal = Decimal("0")
    point_used: int = 0
    point_earned: int = 0
    ordered_at: datetime
    paid_at: datetime | None = None


class OrderItem(BaseModel):
    """unit_price는 STORE_PRODUCT.price와 별도로 결제 시점 스냅샷을 저장한다(가격 이력 보존)."""

    order_item_id: int
    order_id: int
    product_id: int
    quantity: int = 1
    unit_price: Decimal
    subtotal: Decimal
    source_type: OrderItemSourceType


class PointTransaction(BaseModel):
    point_txn_id: int
    member_id: int
    order_id: int
    applied_grade_id: int | None = None
    txn_type: PointTxnType
    point_amount: int
    point_rate: Decimal | None = None
    balance_after: int
    created_at: datetime
