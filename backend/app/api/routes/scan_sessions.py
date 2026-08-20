import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import CurrentUser, get_current_user
from app.core.supabase_client import get_supabase
from app.schemas.scan import ScanSessionCreate

router = APIRouter(prefix="/scan-sessions", tags=["scan"])
logger = structlog.get_logger("app.scan")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_scan_session(payload: ScanSessionCreate, user: CurrentUser = Depends(get_current_user)):
    """트레이 스캔 시작 (FR-01). scan_session 테이블에 status='CAPTURED'로 1행 생성."""
    supabase = get_supabase()
    result = (
        supabase.table("scan_session")
        .insert({**payload.model_dump(), "status": "CAPTURED"})
        .execute()
    )
    session = result.data[0]

    structlog.contextvars.bind_contextvars(
        scan_session_id=session["scan_session_id"],
        store_id=payload.store_id,
        staff_id=payload.staff_id,
    )
    logger.info("scan.captured", image_url=payload.image_url)
    return session


@router.post("/{scan_session_id}/recognize")
async def recognize_scan_session(scan_session_id: int, user: CurrentUser = Depends(get_current_user)):
    """AI 인식 실행 지점 (FR-02, stub).

    의도한 아키텍처: 이 API 프로세스 안에서 빵 인식 모델을 직접 로드하지 않고, 별도의
    GPU 인스턴스(학습/추론 전용, `backend/Dockerfile.gpu` + `docker-compose.gpu.yml` 참고)에
    scan_session.image_url을 넘겨 HTTP/gRPC로 추론을 위임하고, 반환된 탐지 결과를
    detected_item 테이블에 적재하는 흐름이 될 예정이다. 아직 GPU 추론 서버가 연결되지
    않아 501을 반환한다. 연결 후에는 scan_session.status를 RECOGNIZING → COMPLETED/FAILED로
    전이시키고 recognition_ms(NFR-01, 3초 이내 목표)를 기록해야 한다.
    """
    structlog.contextvars.bind_contextvars(scan_session_id=scan_session_id)
    logger.info("scan.recognize_requested")
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "AI 인식 서버가 아직 연결되지 않았습니다")
