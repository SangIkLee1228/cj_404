from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.codes import NotificationType


class NotificationListItem(BaseModel):
    """GET /api/notifications 목록 1건 (API명세서 v1.3 · 4.8). product_name은
    related_product_id로 PRODUCT를 조인해 채운다(NULL이면 SYSTEM 알림 등)."""

    notification_id: int
    notif_type: NotificationType
    related_product_id: int | None = None
    product_name: str | None = None
    title: str
    message: str
    remaining_qty_snapshot: int | None = None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationListItem]
    total: int
    limit: int
    offset: int
    unread_count: int
    updated_at: datetime


class UnreadCountResponse(BaseModel):
    unread_count: int


class ReadAllResponse(BaseModel):
    updated_count: int


class Notification(BaseModel):
    """재고 기준선(PRODUCT.stock_baseline_pct) 대비 INVENTORY.remaining_qty 비교로 발생하는
    매진 임박 수량 알림 (v1.2, FR-15 개정). 삭제는 소프트 삭제(is_deleted)."""

    notification_id: int
    store_id: int
    notif_type: NotificationType
    related_product_id: int | None = None
    remaining_qty_snapshot: int | None = None
    title: str
    message: str
    is_read: bool = False
    read_at: datetime | None = None
    is_deleted: bool = False
    deleted_at: datetime | None = None
    created_at: datetime


class SalesStatDaily(BaseModel):
    """ORDER_ITEM/CORRECTION_LOG를 배치로 집계한 일별 판매 통계 (FR-17)."""

    stat_id: int
    store_id: int
    product_id: int
    stat_date: date
    sold_qty: int = 0
    sales_amount: Decimal = Decimal("0")
    correction_count: int = 0
    correction_rate: Decimal = Decimal("0")


class DemographicStat(BaseModel):
    """비식별 구매 통계 (FR-19, NFR-06). member_id 등 개인 식별자를 포함하지 않는다."""

    stat_id: int
    store_id: int
    stat_date: date
    gender: str | None = None
    age_group: str | None = None
    purchase_count: int = 0
    sales_amount: Decimal = Decimal("0")
