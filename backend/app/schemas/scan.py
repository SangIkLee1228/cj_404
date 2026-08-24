from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.codes import (
    CaptureType,
    CorrectedByType,
    CorrectionType,
    ScanSessionStatus,
)


class ScanSession(BaseModel):
    """SCAN_SESSION 행 (DB설계서 v2.2 · 4.7).

    order_id로 주문에 연결된다(1:N). 결제 확정 전이거나 폐기된 세션은 NULL이다.
    """

    scan_session_id: int
    store_id: int
    staff_id: int
    order_id: int | None = None
    capture_type: CaptureType = "BASIC"
    image_url: str | None = None
    status: ScanSessionStatus = "CAPTURED"
    overlap_warning: bool = False
    recognition_ms: int | None = None
    failure_reason: str | None = None
    started_at: datetime
    completed_at: datetime | None = None


class ScanSessionCreate(BaseModel):
    """트레이 촬영 시작 (FR-01, API명세서 v1.2 · 4.4).

    store_id/staff_id는 요청 바디로 받지 않는다 - 서버가 인증 컨텍스트에서 결정한다.
    image_path는 POST /api/storage/images가 반환한 경로이며 DB의 image_url 컬럼에 저장된다.
    """

    order_id: int
    capture_type: CaptureType = "BASIC"
    image_path: str | None = None
    overlap_warning: bool = False


class DetectedItem(BaseModel):
    """AI가 트레이 이미지에서 탐지한 개별 항목 1건 (FR-02).

    product_id가 None이면 AI 클래스에 매칭되는 상품이 없다는 뜻이다.
    ai_class_label은 AI의 원본 출력이며, 현재 파이프라인에서는 상품명 문자열이다.
    매칭 실패 시 '__UNMATCHED__'.
    """

    detected_item_id: int
    scan_session_id: int
    product_id: int | None = None
    ai_class_label: str
    confidence: Decimal = Field(ge=0, le=100)
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
