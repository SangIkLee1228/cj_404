from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.codes import NotificationType

# 목업 알림 필터는 "재고 부족 / 매진"으로 갈리는데 DB의 notif_type은 STOCK_LOW 하나뿐이라
# 수량 스냅샷에서 파생한다. INFO는 SYSTEM 알림처럼 재고와 무관한 건이다.
NotificationSeverity = Literal["OUT", "LOW", "INFO"]


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
    severity: NotificationSeverity
    is_read: bool
    created_at: datetime


class NotificationSummary(BaseModel):
    """목업 알림 페이지 상단의 "2 매진 · 3 재고 부족 · 5 안읽음" 카운트.

    현재 필터가 아니라 **매장 전체** 기준이다 - 필터를 걸어도 상단 숫자는 안 바뀌어야
    "매진 2건이 있으니 그 탭을 눌러보자"가 성립한다.
    """

    out_count: int
    low_count: int
    unread_count: int


class NotificationListResponse(BaseModel):
    items: list[NotificationListItem]
    total: int
    limit: int
    offset: int
    unread_count: int
    summary: NotificationSummary
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
