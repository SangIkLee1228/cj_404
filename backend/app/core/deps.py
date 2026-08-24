"""라우트 공통 의존성 (Dependency).

API명세서 v1.2 · 1.1의 핵심 규약을 한 곳에서 강제한다:
    "요청 바디·쿼리에 store_id·staff_id를 넣지 않는다. 서버가 결정한다."

클라이언트가 store_id를 마음대로 보내면 다른 매장의 재고를 차감하거나
남의 매장 매출을 조회할 수 있다. 그래서 이 값은 반드시 인증 컨텍스트에서 유도한다.
"""

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status

from app.core.config import get_settings
from app.core.security import CurrentUser, get_current_user
from app.core.supabase_client import get_supabase


@dataclass(frozen=True)
class StaffContext:
    """이번 요청을 수행하는 직원. 라우트는 이 값만 신뢰한다."""

    staff_id: int
    store_id: int
    role: str


def get_staff_context(user: CurrentUser = Depends(get_current_user)) -> StaffContext:
    """JWT → STAFF_ACCOUNT 조회로 staff_id·store_id를 확정한다.

    AUTH_DISABLED=true(MVP 시연)면 .env의 고정 직원을 쓴다.
    """
    settings = get_settings()

    if settings.auth_disabled:
        return StaffContext(
            staff_id=settings.dev_staff_id,
            store_id=settings.dev_store_id,
            role=settings.dev_staff_role,
        )

    supabase = get_supabase()
    result = (
        supabase.table("staff_account")
        .select("staff_id, store_id, role")
        .eq("auth_user_id", user.id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "등록되지 않은 직원 계정입니다"
        )

    row = result.data[0]
    return StaffContext(
        staff_id=row["staff_id"], store_id=row["store_id"], role=row["role"]
    )


def require_manager(staff: StaffContext = Depends(get_staff_context)) -> StaffContext:
    """매니저 전용 엔드포인트용. 위반 시 403 (API명세서 1.1)."""
    if staff.role != "MANAGER":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "매니저 권한이 필요합니다")
    return staff
