from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.codes import CorrectedByType, CorrectionType, ScanSessionStatus


class ScanSession(BaseModel):
    scan_session_id: int
    store_id: int
    staff_id: int
    image_url: str | None = None
    status: ScanSessionStatus = "CAPTURED"
    overlap_warning: bool = False
    recognition_ms: int | None = None
    failure_reason: str | None = None
    started_at: datetime
    completed_at: datetime | None = None


class ScanSessionCreate(BaseModel):
    """트레이 스캔 시작 (FR-01). image_url은 storage.upload_image()가 반환한 path.

    store_id/staff_id를 요청 바디로 직접 받는다: STAFF_ACCOUNT(BIGINT staff_id)와 Supabase
    Auth 사용자(UUID)를 연결하는 매핑이 아직 없어 JWT에서 안전하게 유도할 수 없다.
    """

    store_id: int
    staff_id: int
    image_url: str | None = None


class DetectedItem(BaseModel):
    """AI가 트레이 이미지에서 탐지한 개별 항목 1건 (FR-02)."""

    detected_item_id: int
    scan_session_id: int
    product_id: int | None = None
    ai_class_label: str
    confidence: Decimal  # 0~100
    bbox_x: Decimal | None = None
    bbox_y: Decimal | None = None
    bbox_w: Decimal | None = None
    bbox_h: Decimal | None = None
    quantity: int = 1
    is_below_threshold: bool = False
    created_at: datetime


class CorrectionLog(BaseModel):
    """정정 이력 (FR-04/05/06/20). append-only - UPDATE/DELETE 금지, 재학습 데이터 원천."""

    correction_log_id: int
    scan_session_id: int
    detected_item_id: int | None = None
    order_item_id: int | None = None
    correction_type: CorrectionType
    before_product_id: int | None = None
    before_qty: int | None = None
    after_product_id: int | None = None
    after_qty: int | None = None
    corrected_by_type: CorrectedByType
    corrected_by_staff_id: int | None = None
    corrected_at: datetime
