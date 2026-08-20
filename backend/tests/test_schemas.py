"""스냅빵 DB설계서 v1.2의 16개 테이블을 옮긴 app/schemas/*의 타입 정의가
실제로 유효한 pydantic 모델인지(임포트·검증 가능 여부) 확인하는 스모크 테스트."""

from app.schemas.common import Member, MembershipGrade, Product, Store
from app.schemas.inventory import Inventory
from app.schemas.notifications import DemographicStat, Notification, SalesStatDaily
from app.schemas.orders import Order, OrderItem, PointTransaction
from app.schemas.scan import CorrectionLog, DetectedItem, ScanSession
from app.schemas.system import ModelVersion

NOW = "2026-08-20T12:00:00Z"


def test_product_schema_roundtrip():
    product = Product(
        product_id=1,
        store_id=1,
        product_name="소보루빵",
        price="1500",
        source_type="IN_STORE",
        created_at=NOW,
        updated_at=NOW,
    )
    assert product.price == 1500
    assert product.stock_baseline_pct == 5  # 기본값


def test_scan_and_order_schemas_instantiate():
    session = ScanSession(
        scan_session_id=1, store_id=1, staff_id=1, started_at=NOW
    )
    assert session.status == "CAPTURED"

    order = Order(order_id=1, store_id=1, staff_id=1, ordered_at=NOW)
    assert order.status == "PENDING"

    item = OrderItem(
        order_item_id=1,
        order_id=1,
        product_id=1,
        unit_price="1500",
        subtotal="1500",
        source_type="AI_DETECTED",
    )
    assert item.quantity == 1


def test_remaining_schemas_instantiate():
    Store(store_id=1, store_name="본점", store_code="ST-001", created_at=NOW, updated_at=NOW)
    MembershipGrade(
        grade_id=1, grade_code="GOLD", grade_name="골드", created_at=NOW, updated_at=NOW
    )
    Member(
        member_id=1, phone="010-0000-0000", name="정하윤", grade_id=1, created_at=NOW, updated_at=NOW
    )
    DetectedItem(
        detected_item_id=1,
        scan_session_id=1,
        ai_class_label="soboru",
        confidence="92.50",
        created_at=NOW,
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
        message="소보루빵 5개 남음",
        created_at=NOW,
    )
    SalesStatDaily(stat_id=1, store_id=1, product_id=1, stat_date="2026-08-20")
    DemographicStat(stat_id=1, store_id=1, stat_date="2026-08-20")
    ModelVersion(model_version_id=1, version_name="v0.1.0", created_at=NOW)
