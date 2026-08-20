from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, get_current_user
from app.core.supabase_client import get_supabase

router = APIRouter(prefix="/notifications", tags=["notifications"])
logger = structlog.get_logger("app.notifications")


@router.get("")
def list_notifications(store_id: int | None = None, user: CurrentUser = Depends(get_current_user)):
    """매진 임박 수량 알림 목록 (FR-15, v1.2 개정). 미삭제 알림만 반환.

    알림 자체는 PRODUCT.stock_baseline_pct 대비 INVENTORY.remaining_qty 비교로 생성되며
    (배치 또는 결제완료 트리거, 이 저장소에는 아직 미구현), 이 라우트는 조회만 담당한다.
    """
    supabase = get_supabase()
    query = supabase.table("notification").select("*").eq("is_deleted", False)
    if store_id is not None:
        query = query.eq("store_id", store_id)
    result = query.order("created_at", desc=True).execute()
    return result.data


@router.patch("/{notification_id}/read")
def mark_notification_read(notification_id: int, user: CurrentUser = Depends(get_current_user)):
    """알림 읽음 처리. 목업의 '체크박스 다중 선택 후 일괄 읽음'은 이 엔드포인트를 여러 건 호출하거나
    별도 벌크 엔드포인트로 확장하면 된다(현재는 단건만 지원)."""
    supabase = get_supabase()
    result = (
        supabase.table("notification")
        .update({"is_read": True, "read_at": datetime.now(UTC).isoformat()})
        .eq("notification_id", notification_id)
        .execute()
    )
    logger.info("notification.marked_read", notification_id=notification_id)
    return result.data[0]
