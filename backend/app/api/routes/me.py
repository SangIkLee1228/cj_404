from fastapi import APIRouter, Depends

from app.core.config import get_settings
from app.core.security import CurrentUser, get_current_user
from app.schemas.common import MeResponse

router = APIRouter(prefix="/me", tags=["auth"])


@router.get("", response_model=MeResponse)
def read_current_user(user: CurrentUser = Depends(get_current_user)):
    '''
    현재 직원 정보 (API명세서 4.1).

    MVP는 로그인 화면이 없다. AUTH_DISABLED=true면 시드 고정 직원을 반환하고,
    false면 JWT sub -> STAFF_ACCOUNT.auth_user_id 조회로 대체한다(확장 시).
    '''
    settings = get_settings()

    return {
        "staff_id": settings.dev_staff_id,
        "store_id": settings.dev_store_id,
        "name": settings.dev_staff_name,
        "role": settings.dev_staff_role,
        "store_name": settings.dev_store_name,
        "auth_user_id": None if settings.auth_disabled else user.id,
    }
