"""상품 마스터 API (FR-16, API명세서 v1.2 · 4.2).

DB설계서 v2.0에서 PRODUCT가 둘로 쪼개졌다:
    PRODUCT        - 매장 무관 카탈로그 (이름·분류·이미지)
    STORE_PRODUCT  - 매장별 판매정보 (가격·매진임박 기준선·판매여부)

그래서 "상품 목록"은 한 테이블 조회가 아니라 **조인**이다.
PostgREST의 임베디드 리소스 문법을 쓰며, `!inner`를 붙여야
해당 매장에 STORE_PRODUCT 행이 없는 상품이 결과에서 빠진다.
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import StaffContext, get_staff_context, require_manager
from app.core.supabase_client import get_supabase
from app.schemas.common import ProductCreate, ProductRead, ProductUpdate

router = APIRouter(prefix="/products", tags=["products"])
logger = structlog.get_logger("app.products")

# PRODUCT ⨝ STORE_PRODUCT 조인 select 절
_SELECT = (
    "product_id, product_name, product_type, category, image_url, source_type, is_active,"
    " store_product!inner(price, stock_baseline_pct, is_active)"
)


def _flatten(row: dict) -> ProductRead:
    """조인 결과({..., store_product: [{...}]})를 평평한 응답 1건으로 만든다."""
    sp = row["store_product"]
    sp = sp[0] if isinstance(sp, list) else sp
    return ProductRead(
        product_id=row["product_id"],
        product_name=row["product_name"],
        product_type=row["product_type"],
        category=row.get("category"),
        price=int(round(float(sp["price"]))),  # 금액은 정수로 (API명세서 1.2)
        image_url=row.get("image_url"),
        source_type=row["source_type"],
        stock_baseline_pct=sp.get("stock_baseline_pct"),
        is_active=bool(row["is_active"]) and bool(sp["is_active"]),
    )


@router.get("")
def list_products(
    product_type: str | None = Query(default=None, pattern="^(BREAD|DRINK)$"),
    category: str | None = None,
    q: str | None = Query(default=None, description="상품명 부분 검색"),
    item_status: str = Query(default="ACTIVE", alias="status", pattern="^(ACTIVE|INACTIVE|ALL)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    staff: StaffContext = Depends(get_staff_context),
):
    """상품 목록 (FR-16). 현재 직원의 매장 기준으로 가격을 붙여 내려준다."""
    supabase = get_supabase()
    query = (
        supabase.table("product")
        .select(_SELECT, count="exact")
        .eq("store_product.store_id", staff.store_id)
    )

    if item_status == "ACTIVE":
        query = query.eq("is_active", True).eq("store_product.is_active", True)
    elif item_status == "INACTIVE":
        query = query.eq("is_active", False)

    if product_type:
        query = query.eq("product_type", product_type)
    if category:
        query = query.eq("category", category)
    if q:
        query = query.ilike("product_name", f"%{q}%")

    result = (
        query.order("product_type")
        .order("category")
        .order("product_name")
        .range(offset, offset + limit - 1)
        .execute()
    )

    return {
        "items": [_flatten(row) for row in result.data],
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{product_id}")
def get_product(product_id: int, staff: StaffContext = Depends(get_staff_context)):
    """상품 단건 (상품 수정 화면 진입용)."""
    supabase = get_supabase()
    result = (
        supabase.table("product")
        .select(_SELECT)
        .eq("product_id", product_id)
        .eq("store_product.store_id", staff.store_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "상품을 찾을 수 없습니다")
    return _flatten(result.data[0])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, staff: StaffContext = Depends(require_manager)):
    """상품 등록 (FR-16, 매니저 전용).

    한 번의 요청이 최대 3개 테이블에 쓴다:
        1) PRODUCT        - 카탈로그 등록
        2) STORE_PRODUCT  - 이 매장의 판매가
        3) INVENTORY      - initial_qty를 주면 재고 행까지 (선택)
    """
    supabase = get_supabase()

    product_row = {
        "product_name": payload.product_name,
        "product_type": payload.product_type,
        "category": payload.category,
        "image_url": payload.image_url,
        "source_type": payload.source_type,
        "created_by": staff.staff_id,
    }
    created = supabase.table("product").insert(product_row).execute().data[0]
    product_id = created["product_id"]

    supabase.table("store_product").insert(
        {
            "store_id": staff.store_id,
            "product_id": product_id,
            "price": float(payload.price),
            "stock_baseline_pct": payload.stock_baseline_pct,
        }
    ).execute()

    if payload.initial_qty > 0:
        supabase.table("inventory").insert(
            {
                "store_id": staff.store_id,
                "product_id": product_id,
                "produced_qty": payload.initial_qty,
                "sold_qty": 0,
                "remaining_qty": payload.initial_qty,
            }
        ).execute()

    logger.info(
        "product.created",
        product_id=product_id,
        store_id=staff.store_id,
        initial_qty=payload.initial_qty,
    )
    return get_product(product_id, staff)


@router.patch("/{product_id}")
def update_product(
    product_id: int, payload: ProductUpdate, staff: StaffContext = Depends(require_manager)
):
    """상품 수정 (FR-16, 매니저 전용). 보낸 필드만 반영한다.

    카탈로그 필드는 PRODUCT, 가격·기준선은 STORE_PRODUCT로 나눠 쓴다.
    """
    supabase = get_supabase()
    sent = payload.model_dump(exclude_unset=True)

    catalog = {
        k: v
        for k, v in sent.items()
        if k in {"product_name", "product_type", "category", "image_url", "source_type", "is_active"}
    }
    if catalog:
        supabase.table("product").update(catalog).eq("product_id", product_id).execute()

    store_fields: dict = {}
    if "price" in sent:
        store_fields["price"] = float(sent["price"])
    if "stock_baseline_pct" in sent:
        store_fields["stock_baseline_pct"] = sent["stock_baseline_pct"]
    if "is_active" in sent:
        store_fields["is_active"] = sent["is_active"]
    if store_fields:
        (
            supabase.table("store_product")
            .update(store_fields)
            .eq("product_id", product_id)
            .eq("store_id", staff.store_id)
            .execute()
        )

    logger.info("product.updated", product_id=product_id, fields=sorted(sent))
    return get_product(product_id, staff)
