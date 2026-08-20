from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, get_current_user
from app.core.supabase_client import get_supabase

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("")
def list_inventory(store_id: int | None = None, user: CurrentUser = Depends(get_current_user)):
    """재고 대시보드 (FR-13). 매장×상품별 재고 스냅샷 조회 예시.

    참고 정보일 뿐이며 자동 발주로 이어지지 않는다(NFR-07) - 화면에도 이 문구를 명시할 것.
    """
    supabase = get_supabase()
    query = supabase.table("inventory").select("*")
    if store_id is not None:
        query = query.eq("store_id", store_id)
    result = query.execute()
    return result.data
