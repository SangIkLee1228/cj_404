import structlog
from fastapi import APIRouter, Depends, status

from app.core.security import CurrentUser, get_current_user
from app.core.supabase_client import get_supabase
from app.schemas.common import ProductCreate

router = APIRouter(prefix="/products", tags=["products"])
logger = structlog.get_logger("app.products")


@router.get("")
def list_products(store_id: int | None = None, user: CurrentUser = Depends(get_current_user)):
    """상품(빵) 마스터 목록 (FR-16). PRODUCT 테이블 조회 예시.

    MVP는 단일 매장을 가정하므로 store_id는 선택值이다 - 넘기지 않으면 활성 상품 전체를 반환한다.
    """
    supabase = get_supabase()
    query = supabase.table("product").select("*").eq("is_active", True)
    if store_id is not None:
        query = query.eq("store_id", store_id)
    result = query.execute()
    return result.data


@router.post("", status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, user: CurrentUser = Depends(get_current_user)):
    """매니저의 상품 등록 (FR-16). PRODUCT 테이블 insert 예시."""
    supabase = get_supabase()
    result = supabase.table("product").insert(payload.model_dump()).execute()
    product = result.data[0]
    logger.info("product.created", product_id=product["product_id"], store_id=payload.store_id)
    return product
