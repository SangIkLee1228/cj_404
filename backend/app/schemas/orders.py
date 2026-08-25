from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.codes import MembershipGradeCode, OrderItemSourceType, OrderStatus, PaymentMethod, PointTxnType


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


class OrderMemberSummary (BaseModel):
    ''' 주문에 연결된 회원 요약. 이름은 서버가 마스킹해 내보낸다. '''
    member_id: int
    name: str
    grade_code: MembershipGradeCode | None


class OrderItemRead(BaseModel):
    ''' GET /orders/{id} 의 items 원소 (API 명세서 4.5) '''
    order_item_id: int
    product_id: int
    product_name: str | None = None
    quantity: int
    unit_price: int
    subtotal: int
    source_type: OrderItemSourceType
    needs_review: bool = False


class OrderDetail(BaseModel):
    '''주문 상세. GET /orders/{id} 와 항목 CRUD 3종이 모두 이 모양을 반환한다.'''

    order_id: int
    status: OrderStatus
    ordered_at: datetime
    paid_at: datetime | None = None
    payment_method: PaymentMethod | None = None
    gross_amount: int
    membership_discount_amount: int
    manual_discount_amount: int
    discount_amount: int
    total_amount: int
    member: OrderMemberSummary | None = None
    point_earned: int
    point_used: int
    correction_count: int = 0
    items: list[OrderItemRead]
