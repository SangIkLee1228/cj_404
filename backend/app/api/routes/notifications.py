"""매진 임박 수량 알림 API (FR-15, API명세서 v1.3 · 4.8).

알림 생성(재고 대비 STORE_PRODUCT.stock_baseline_pct 비교, 배치 또는 결제완료 트리거)은
이 저장소에 아직 없다(그룹 A · POST /orders/{id}/pay 구현 시 함께 붙는다). 이 라우트는
조회·읽음 처리·삭제만 담당한다.
"""

from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, Query, status

from app.core.deps import StaffContext, get_staff_context
from app.core.errors import ApiError
from app.core.supabase_client import get_supabase
from app.schemas.notifications import (
    NotificationListItem,
    NotificationListResponse,
    ReadAllResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])
logger = structlog.get_logger("app.notifications")

# related_product_id가 NULL 허용이라 product는 기본 LEFT JOIN으로 임베딩된다(!inner 불필요).
_SELECT = (
    "notification_id, notif_type, related_product_id, remaining_qty_snapshot,"
    " title, message, is_read, created_at, product(product_name)"
)


def _to_item(row: dict) -> NotificationListItem:
    product = row.get("product")
    product_name = product.get("product_name") if product else None
    return NotificationListItem(
        notification_id=row["notification_id"],
        notif_type=row["notif_type"],
        related_product_id=row.get("related_product_id"),
        product_name=product_name,
        title=row["title"],
        message=row["message"],
        remaining_qty_snapshot=row.get("remaining_qty_snapshot"),
        is_read=row["is_read"],
        created_at=row["created_at"],
    )


def _unread_count(store_id: int) -> int:
    supabase = get_supabase()
    result = (
        supabase.table("notification")
        .select("notification_id", count="exact")
        .eq("store_id", store_id)
        .eq("is_deleted", False)
        .eq("is_read", False)
        .execute()
    )
    return result.count or 0


def _require_owned(notification_id: int, store_id: int) -> None:
    """다른 매장 알림을 읽음 처리·삭제하지 못하게 막는다(GET /inventory와 동일한 격리 원칙)."""
    supabase = get_supabase()
    result = (
        supabase.table("notification")
        .select("notification_id")
        .eq("notification_id", notification_id)
        .eq("store_id", store_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise ApiError(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "알림을 찾을 수 없습니다")


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    is_read: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    staff: StaffContext = Depends(get_staff_context),
):
    """알림 목록. 미삭제 알림만 반환한다."""
    supabase = get_supabase()
    query = (
        supabase.table("notification")
        .select(_SELECT, count="exact")
        .eq("store_id", staff.store_id)
        .eq("is_deleted", False)
    )
    if is_read is not None:
        query = query.eq("is_read", is_read)

    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    items = [_to_item(row) for row in result.data]
    updated_at = max((item.created_at for item in items), default=datetime.now(UTC))

    return NotificationListResponse(
        items=items,
        total=result.count or 0,
        limit=limit,
        offset=offset,
        unread_count=_unread_count(staff.store_id),
        updated_at=updated_at,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(staff: StaffContext = Depends(get_staff_context)):
    """사이드바 배지용 미읽음 개수."""
    return UnreadCountResponse(unread_count=_unread_count(staff.store_id))


@router.patch("/read-all", response_model=ReadAllResponse)
def mark_all_read(staff: StaffContext = Depends(get_staff_context)):
    """매장 전체 미읽음 알림 일괄 읽음 처리."""
    supabase = get_supabase()
    result = (
        supabase.table("notification")
        .update({"is_read": True, "read_at": datetime.now(UTC).isoformat()})
        .eq("store_id", staff.store_id)
        .eq("is_deleted", False)
        .eq("is_read", False)
        .execute()
    )
    updated_count = len(result.data)
    logger.info("notification.marked_all_read", store_id=staff.store_id, count=updated_count)
    return ReadAllResponse(updated_count=updated_count)


@router.patch("/{notification_id}/read", response_model=NotificationListItem)
def mark_notification_read(
    notification_id: int, staff: StaffContext = Depends(get_staff_context)
):
    """알림 읽음 처리(단건). 목업의 '체크박스 다중 선택 후 일괄 읽음'은 이 엔드포인트를
    여러 번 호출하거나 /read-all로 커버한다."""
    _require_owned(notification_id, staff.store_id)

    supabase = get_supabase()
    supabase.table("notification").update(
        {"is_read": True, "read_at": datetime.now(UTC).isoformat()}
    ).eq("notification_id", notification_id).execute()

    result = (
        supabase.table("notification")
        .select(_SELECT)
        .eq("notification_id", notification_id)
        .limit(1)
        .execute()
    )
    logger.info("notification.marked_read", notification_id=notification_id)
    return _to_item(result.data[0])


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(notification_id: int, staff: StaffContext = Depends(get_staff_context)):
    """소프트 삭제(is_deleted=true) - 목록에서만 빠지고 행은 남는다."""
    _require_owned(notification_id, staff.store_id)

    supabase = get_supabase()
    supabase.table("notification").update(
        {"is_deleted": True, "deleted_at": datetime.now(UTC).isoformat()}
    ).eq("notification_id", notification_id).execute()
    logger.info("notification.deleted", notification_id=notification_id)
