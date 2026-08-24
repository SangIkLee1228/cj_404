"""스냅빵 DB설계서 v2.2의 17개 테이블을 옮긴 app/schemas/*의 타입 정의가
실제 DB 스키마와 맞는지 확인하는 스모크 테스트.

v2.0에서 PRODUCT가 카탈로그(PRODUCT)와 매장별 판매정보(STORE_PRODUCT)로 분리되었고,
v2.2에서 product.ai_class_label이 삭제되었다. 이 테스트는 그 구조를 검증한다.
"""

import pytest
from pydantic import ValidationError

from app.schemas.common import (
    Member,
    MembershipGrade,
    Product,
    ProductCreate,
    ProductRead,
    StaffAccount,
    Store,
    StoreProduct,
)
from app.schemas.inventory import Inventory
from app.schemas.notifications import DemographicStat, Notification, SalesStatDaily
from app.schemas.orders import Order, OrderItem, PointTransaction
from app.schemas.scan import CorrectionLog, DetectedItem, ScanSession, ScanSessionCreate
from app.schemas.system import ModelVersion

NOW = "2026-08-20T12:00:00Z"
UUID_STR = "00000000-0000-4000-8000-000000000001"


# --------------------------------------------------------------------------
# PRODUCT / STORE_PRODUCT 분리 (DB설계서 v2.0 · 2장)
# --------------------------------------------------------------------------
def test_product_is_store_agnostic_catalog():
    """PRODUCT는 매장 무관 카탈로그다. price/store_id/stock_baseline_pct를 갖지 않는다."""
    product = Product(
        product_id=115,
        product_name="호박 패스트리 식빵",
        product_type="BREAD",
        category="식빵",
        source_type="IN_STORE",
        created_at=NOW,
        updated_at=NOW,
    )
    assert product.product_type == "BREAD"
    for moved in ("price", "store_id", "stock_baseline_pct"):
        assert moved not in Product.model_fields, f"{moved}는 STORE_PRODUCT로 이동했다"
    # v2.2에서 삭제된 컬럼
    assert "ai_class_label" not in Product.model_fields


def test_store_product_holds_price():
    sp = StoreProduct(
        store_product_id=1,
        store_id=1,
        product_id=115,
        price="4200",
        created_at=NOW,
        updated_at=NOW,
    )
    assert sp.price == 4200
    assert sp.stock_baseline_pct == 20  # 컬럼 기본값


def test_product_read_is_join_result_with_integer_price():
    """GET /api/products 응답은 조인 결과이고, 금액은 정수다(API명세서 1.2)."""
    read = ProductRead(
        product_id=115,
        product_name="호박 패스트리 식빵",
        product_type="BREAD",
        category="식빵",
        price=4200,
        source_type="IN_STORE",
        stock_baseline_pct=10,
    )
    assert isinstance(read.price, int)


def test_product_create_does_not_accept_store_id():
    """store_id/created_by는 서버가 결정한다 (API명세서 1.1)."""
    assert "store_id" not in ProductCreate.model_fields
    assert "created_by" not in ProductCreate.model_fields

    payload = ProductCreate(
        product_name="소보로빵", product_type="BREAD", price="2600", source_type="IN_STORE"
    )
    assert payload.stock_baseline_pct == 20  # 기본값 (5가 아님)
    assert payload.initial_qty == 0

    with pytest.raises(ValidationError):
        ProductCreate(product_name="음수빵", price="-1", source_type="IN_STORE")


# --------------------------------------------------------------------------
# 코드값 (DB CHECK 제약과 1:1)
# --------------------------------------------------------------------------
def test_membership_grade_codes_match_db():
    for code in ("FRIENDS", "FAMILY", "MANIA", "VIP"):
        MembershipGrade(
            grade_id=1, grade_code=code, grade_name=code, created_at=NOW, updated_at=NOW
        )
    with pytest.raises(ValidationError):
        MembershipGrade(
            grade_id=1, grade_code="GOLD", grade_name="골드", created_at=NOW, updated_at=NOW
        )


def test_scan_session_supports_discarded_and_capture_type():
    session = ScanSession(
        scan_session_id=1,
        store_id=1,
        staff_id=1,
        order_id=120,
        capture_type="RETAKE",
        status="DISCARDED",
        started_at=NOW,
    )
    assert session.capture_type == "RETAKE"
    assert session.status == "DISCARDED"


def test_scan_session_create_does_not_accept_store_or_staff():
    assert "store_id" not in ScanSessionCreate.model_fields
    assert "staff_id" not in ScanSessionCreate.model_fields
    payload = ScanSessionCreate(order_id=120)
    assert payload.capture_type == "BASIC"


# --------------------------------------------------------------------------
# 주문 금액 항등식 (API명세서 1.5 · DB CHECK 제약)
# --------------------------------------------------------------------------
def test_order_has_gross_amount_and_no_scan_session_id():
    assert "gross_amount" in Order.model_fields
    assert "scan_session_id" not in Order.model_fields, "SCAN_SESSION.order_id로 연결된다"

    order = Order(
        order_id=1,
        store_id=1,
        staff_id=1,
        gross_amount="11100",
        membership_discount_amount="111",
        manual_discount_amount="0",
        discount_amount="111",
        total_amount="10989",
        ordered_at=NOW,
    )
    assert order.status == "PENDING"
    assert order.discount_amount == (
        order.membership_discount_amount + order.manual_discount_amount
    )
    assert order.total_amount == order.gross_amount - order.discount_amount


def test_order_item_subtotal():
    item = OrderItem(
        order_item_id=1,
        order_id=1,
        product_id=115,
        quantity=2,
        unit_price="1500",
        subtotal="3000",
        source_type="AI_DETECTED",
    )
    assert item.subtotal == item.unit_price * item.quantity


# --------------------------------------------------------------------------
# 나머지 스키마 스모크
# --------------------------------------------------------------------------
def test_staff_account_uses_auth_user_id():
    assert "login_id" not in StaffAccount.model_fields
    assert "password_hash" not in StaffAccount.model_fields

    staff = StaffAccount(
        staff_id=1,
        store_id=1,
        auth_user_id=UUID_STR,
        email="manager@snapbbang.demo",
        name="테스트 점장",
        role="MANAGER",
        created_at=NOW,
        updated_at=NOW,
    )
    assert str(staff.auth_user_id) == UUID_STR


def test_detected_item_confidence_range():
    DetectedItem(
        detected_item_id=1,
        scan_session_id=1,
        ai_class_label="소보로빵",
        confidence="92.50",
        created_at=NOW,
    )
    # 매칭 실패 케이스
    unmatched = DetectedItem(
        detected_item_id=2,
        scan_session_id=1,
        product_id=None,
        ai_class_label="__UNMATCHED__",
        confidence="41.00",
        is_below_threshold=True,
        created_at=NOW,
    )
    assert unmatched.product_id is None

    with pytest.raises(ValidationError):
        DetectedItem(
            detected_item_id=3,
            scan_session_id=1,
            ai_class_label="x",
            confidence="120",  # 0~100 범위 밖
            created_at=NOW,
        )


def test_remaining_schemas_instantiate():
    Store(store_id=1, store_name="본점", store_code="ST-001", created_at=NOW, updated_at=NOW)
    Member(
        member_id=1, phone="010-0000-0000", name="정하윤", grade_id=1, created_at=NOW, updated_at=NOW
    )
    CorrectionLog(
        correction_log_id=1,
        scan_session_id=1,
        correction_type="QTY_CHANGE",
        corrected_by_type="STAFF",
        corrected_at=NOW,
    )
    PointTransaction(
        point_txn_id=1,
        member_id=1,
        order_id=1,
        txn_type="EARN",
        point_amount=10,
        balance_after=10,
        created_at=NOW,
    )
    Inventory(inventory_id=1, store_id=1, product_id=1, updated_at=NOW)
    Notification(
        notification_id=1,
        store_id=1,
        notif_type="STOCK_LOW",
        title="재고 부족",
        message="소보로빵 5개 남음",
        created_at=NOW,
    )
    SalesStatDaily(stat_id=1, store_id=1, product_id=1, stat_date="2026-08-20")
    DemographicStat(stat_id=1, store_id=1, stat_date="2026-08-20")
    ModelVersion(model_version_id=1, version_name="v0.1.0", created_at=NOW)
