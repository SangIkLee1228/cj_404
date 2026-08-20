from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.codes import MembershipGradeCode, ProductSourceType, StaffRole


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
    """STAFF_ACCOUNT 행. password_hash는 API 응답 스키마에 절대 포함하지 않는다."""

    staff_id: int
    store_id: int
    login_id: str
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
    point_earn_rate: Decimal = Decimal("0")
    min_cumulative_spend: Decimal | None = None
    sort_order: int = 0
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class Member(BaseModel):
    """MEMBER 행. CJ ONE 실연동은 범위 밖 - 가데이터(Mock)."""

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
    product_id: int
    store_id: int
    product_name: str
    category: str | None = None
    price: Decimal
    image_url: str | None = None
    ai_class_label: str | None = None
    source_type: ProductSourceType
    stock_baseline_pct: int | None = 5
    is_active: bool = True
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime


class ProductCreate(BaseModel):
    """매니저의 상품 마스터 등록 (FR-16).

    store_id를 요청 바디로 직접 받는다: STAFF_ACCOUNT(BIGINT staff_id)와 Supabase Auth
    사용자(UUID)를 연결하는 매핑이 아직 설계되지 않아, JWT의 user.id로 created_by(STAFF_ACCOUNT
    FK)를 안전하게 채울 수 없다 - created_by는 그 매핑이 정해지기 전까지 비워둔다(nullable).
    """

    store_id: int
    product_name: str
    category: str | None = None
    price: Decimal
    image_url: str | None = None
    ai_class_label: str | None = None
    source_type: ProductSourceType
    stock_baseline_pct: int | None = 5
