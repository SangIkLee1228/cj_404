from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.codes import (
    MembershipGradeCode,
    ProductSourceType,
    ProductType,
    StaffRole,
)


class Store(BaseModel):
    store_id: int
    store_name: str
    store_code: str
    address: str | None = None
    phone: str | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class StaffAccount(BaseModel):
    """STAFF_ACCOUNT 행.

    MVP는 로그인 화면이 없지만(DB설계서 v2.2 · 10장), 확장 대비로 Supabase Auth
    사용자와의 매핑 컬럼 auth_user_id(UUID)를 스키마에 유지한다.
    v1.4 시절의 login_id/password_hash는 실제 테이블에 존재하지 않는다.
    """

    staff_id: int
    store_id: int
    auth_user_id: UUID
    email: str | None = None
    name: str
    role: StaffRole = "STAFF"
    phone: str | None = None
    is_active: bool = True
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class MembershipGrade(BaseModel):
    grade_id: int
    grade_code: MembershipGradeCode
    grade_name: str
    discount_rate: Decimal = Decimal("0")
    point_earn_rate: Decimal = Decimal("0.0050")
    min_cumulative_spend: Decimal | None = None
    sort_order: int = 0
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class Member(BaseModel):
    """MEMBER 행. CJ ONE 실연동은 범위 밖 - 가데이터(Mock).

    name은 원본으로 저장하되 API 응답에서는 반드시 마스킹한다(NFR-06).
    """

    member_id: int
    cj_one_code: str | None = None
    phone: str
    name: str
    gender: str | None = None
    birth_year: int | None = None
    grade_id: int
    total_spend_amount: Decimal = Decimal("0")
    grade_updated_at: datetime | None = None
    point_balance: int = 0
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class Product(BaseModel):
    """PRODUCT 행 — 매장 무관 상품 카탈로그 (DB설계서 v2.2 · 4.3).

    v2.0에서 PRODUCT가 카탈로그(상품 정체성)와 STORE_PRODUCT(매장별 판매정보)로
    분리되었다. price/stock_baseline_pct/store_id는 여기가 아니라 StoreProduct에 있다.
    """

    product_id: int
    product_name: str
    product_type: ProductType = "BREAD"
    category: str | None = None
    image_url: str | None = None
    source_type: ProductSourceType
    is_active: bool = True
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime


class StoreProduct(BaseModel):
    """STORE_PRODUCT 행 — "이 매장이 이 상품을 얼마에 파는지" (DB설계서 v2.2 · 4.4)."""

    store_product_id: int
    store_id: int
    product_id: int
    price: Decimal
    stock_baseline_pct: int | None = 20
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class ProductRead(BaseModel):
    """GET /api/products 응답 1건 (API명세서 v1.2 · 4.2).

    PRODUCT ⨝ STORE_PRODUCT 조인 결과다. 금액은 정수로 내린다(API명세서 1.2).
    """

    product_id: int
    product_name: str
    product_type: ProductType
    category: str | None = None
    price: int
    image_url: str | None = None
    source_type: ProductSourceType
    stock_baseline_pct: int | None = 20
    is_active: bool = True


class ProductListResponse(BaseModel):
    '''
    GET /api/products 응답 (API 명세서 1.3 목록 규약)

    items, total, limit, offset 은 모든 목록 응답에 항상 포함한다.
    inventory, notifications 도 같은 모양이라 구조를 맞춰둔다.
    '''

    items: list[ProductRead]
    total: int
    limit: int
    offset: int


class ProductCreate(BaseModel):
    """매니저의 상품 마스터 등록 (FR-16, API명세서 v1.2 · 4.2).

    store_id/created_by는 요청 바디로 받지 않는다 - 서버가 인증 컨텍스트에서 결정한다.
    price/stock_baseline_pct는 PRODUCT가 아니라 STORE_PRODUCT 행으로 저장된다.
    """

    product_name: str = Field(min_length=1, max_length=100)
    product_type: ProductType = "BREAD"
    category: str | None = None
    price: Decimal = Field(ge=0)
    source_type: ProductSourceType
    stock_baseline_pct: int | None = Field(default=20, ge=0, le=100)
    image_url: str | None = None
    # 주면 INVENTORY 행을 함께 생성한다(생략 시 0).
    initial_qty: int = Field(default=0, ge=0)


class ProductUpdate(BaseModel):
    """PATCH /api/products/{id} - 보낸 필드만 수정한다."""

    product_name: str | None = Field(
        default=None, min_length=1, max_length=100)
    product_type: ProductType | None = None
    category: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    source_type: ProductSourceType | None = None
    stock_baseline_pct: int | None = Field(default=None, ge=0, le=100)
    image_url: str | None = None
    is_active: bool | None = None


class MemberLookupResponse(BaseModel):
    """GET /api/members/lookup 응답 (API명세서 v1.3 · 4.6, FR-18).

    name은 서버가 항상 마스킹해서 내려준다 - 원본은 API로 나가지 않는다(NFR-06).
    """

    member_id: int
    name: str
    grade_code: MembershipGradeCode
    grade_name: str
    # float인 이유: 명세서 1.2가 "비율은 소수 number"라고 못박는데, Decimal로 두면
    # pydantic이 JSON 문자열("0.0100")로 직렬화한다. FE에서 toFixed()가 터진다.
    discount_rate: float
    point_earn_rate: float
    point_balance: int


class MeResponse(BaseModel):
    '''
    GET /api/me 응답 (API명세서 4.1).

    auth_user_id는 AUTH_DISABLED=true면 항상 None이다. FE가 직접 쓰진 않지만 로깅·로그인 확장 대비로 내려준다.
    '''

    staff_id: int
    store_id: int
    name: str
    role: StaffRole
    store_name: str
    auth_user_id: UUID | None = None


class ProductRecommendation(BaseModel):
    """GET /api/products/recommendations 항목 1건 (API명세서 4.2)."""

    product_id: int
    product_name: str
    product_type: ProductType
    price: int
    image_url: str | None = None
    sold_qty_7d: int
    remaining_qty: int


class RecommendationListResponse(BaseModel):
    items: list[ProductRecommendation]
    total: int
    limit: int
    offset: int
