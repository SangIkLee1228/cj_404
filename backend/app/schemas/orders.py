from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

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
    needs_review: bool = False


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


class OrderMemberSummary(BaseModel):
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


class OrderItemCreate(BaseModel):
    ''' POST /orders/{id}/items 요청 '''
    product_id: int
    quantity: int = Field(default=1, ge=1, le=99)


class OrderItemUpdate(BaseModel):
    ''' PATCH /orers/{id}/items/{items_id} 요청. 수량 변경 또는 상품 재선택 '''
    quantity: int | None = Field(default=None, ge=1, le=99)
    product_id: int | None = None


class ManualDiscountRequest(BaseModel):
    """POST /orders/{id}/discount 요청 (FR-08). 덮어쓰기, amount=0이면 해제."""

    amount: int = Field(ge=0)
    reason: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def _reason_required_when_discounting(self):
        # DB 제약 ck_orders_manual_discount_audit — 할인이 있으면 사유가 필수다.
        # 여기서 막지 않으면 DB가 거부해 500이 나간다. 422로 정직하게 알린다.
        if self.amount > 0 and not (self.reason or "").strip():
            raise ValueError("할인 금액이 있으면 사유를 입력해야 합니다")
        return self


class MemberLinkRequest(BaseModel):
    """POST /orders/{id}/member 요청 (FR-18). 하이픈은 있어도 없어도 된다."""

    phone: str = Field(min_length=10, max_length=13)


class PayRequest(BaseModel):
    """POST /orders/{id}/pay 요청 (FR-09, FR-12)."""

    payment_method: PaymentMethod = "CARD"
    # MVP는 포인트 사용 화면이 없다. 0만 허용한다 (아래 설명 참고).
    point_used: int = Field(default=0, ge=0)


class InventoryUpdate(BaseModel):
    product_id: int
    remaining_qty: int
    is_low_stock: bool


class NotificationCreated(BaseModel):
    notification_id: int
    product_id: int
    title: str


class PayResponse(BaseModel):
    """결제 확정 응답 (API명세서 4.5)."""

    order_id: int
    status: OrderStatus
    paid_at: datetime
    total_amount: int
    point_earned: int
    inventory_updates: list[InventoryUpdate]
    notifications_created: list[NotificationCreated]


class OrderSummary(BaseModel):
    """조회 기간 전체 기준 집계 (페이지 기준이 아니다)."""

    sales_amount: int
    order_count: int
    item_qty: int


class OrderListItem(BaseModel):
    """GET /orders 목록 1건 (API명세서 4.5)."""

    order_id: int
    ordered_at: datetime
    paid_at: datetime | None = None
    item_count: int
    item_summary: str
    gross_amount: int
    discount_amount: int
    total_amount: int
    member_applied: bool
    point_earned: int


class OrderListResponse(BaseModel):
    items: list[OrderListItem]
    total: int
    limit: int
    offset: int
    timezone: str = "Asia/Seoul"
    summary: OrderSummary
