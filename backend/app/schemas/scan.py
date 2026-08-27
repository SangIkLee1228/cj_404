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

# ─────────────────────────────────────────────────────────────
# API 응답 모델
# 위의 ScanSession/DetectedItem은 DB 행을 비추는 모델이고,
# 아래는 API가 밖으로 내보내는 모양이다. 둘은 일부러 다르다.
# ─────────────────────────────────────────────────────────────


class BBox(BaseModel):
    """탐지 박스. 좌상단 원점, 0~1로 정규화 (API명세서 4.4).

    DB는 bbox_x/y/w/h 4개 컬럼이지만 응답에서는 객체 하나로 묶는다.
    AI가 박스를 못 준 경우가 있어 전부 None 허용이다.
    """

    x: float | None = None
    y: float | None = None
    w: float | None = None
    h: float | None = None


class DetectedItemRead(BaseModel):
    """인식 항목 1건.

    product_id가 None이면 AI 클래스에 매칭되는 상품이 없다는 뜻이고,
    그때 ai_class_label은 '__UNMATCHED__'다(API명세서 4.4).
    """

    detected_item_id: int
    product_id: int | None = None
    product_name: str | None = None      # product 조인에서 온다
    ai_class_label: str                  # NOT NULL - AI 원본 출력
    confidence: float = Field(ge=0, le=100)   # 0~100 스케일. 화면에는 노출 금지
    quantity: int
    is_below_threshold: bool             # 임계값 판정은 서버가 한다
    bbox: BBox


class ScanOrderSummary(BaseModel):
    """세션이 붙은 주문의 금액 요약. 촬영 완료 확인 모달이 이걸 쓴다."""

    gross_amount: int
    total_amount: int
    item_count: int


class ScanSessionCreated(BaseModel):
    """POST /api/scan-sessions → 201.

    order_id가 int(옵셔널 아님)인 이유: 이 엔드포인트는 order_id를 필수로 받으므로
    응답에서 None일 수 없다. 아래 ScanSessionDetail은 다르다.
    """

    scan_session_id: int
    order_id: int
    capture_type: CaptureType
    status: ScanSessionStatus
    started_at: datetime


class ScanSessionDetail(BaseModel):
    """GET /api/scan-sessions/{id} 와 recognize의 공통 응답.

    order_id가 None일 수 있는 이유: 세션이 폐기되면 주문 연결이 끊긴다.
    """

    scan_session_id: int
    order_id: int | None = None
    capture_type: CaptureType
    status: ScanSessionStatus
    overlap_warning: bool
    recognition_ms: int | None = None
    failure_reason: str | None = None
    started_at: datetime
    completed_at: datetime | None = None
    detected_items: list[DetectedItemRead]
    order_summary: ScanOrderSummary | None = None


class ScanCancelResponse(BaseModel):
    """POST /api/scan-sessions/{id}/cancel.

    failure_reason이 str(옵셔널 아님)인 이유: 이 라우트가 같은 UPDATE에서
    'CANCELLED_BY_STAFF'를 반드시 넣기 때문이다. 비어 있으면 그게 버그다.
    """

    scan_session_id: int
    status: ScanSessionStatus
    failure_reason: str


class ScanDiscardResponse(BaseModel):
    """POST /api/scan-sessions/{id}/discard."""

    scan_session_id: int
    order_id: int | None = None
    status: ScanSessionStatus
    reverted_item_count: int   # 비운 주문 항목 수. 주문이 없으면 0
