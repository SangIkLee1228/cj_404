import structlog
from fastapi import APIRouter, Response, status

from app import __version__
from app.core.supabase_client import get_supabase
from app.schemas.system import HealthResponse, ReadyResponse

router = APIRouter(tags=["health"])
logger = structlog.get_logger("app.health")


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    ''' 프로세스 생존 확인. DB 를 보지 않는다 (liveness) '''
    return HealthResponse(status="ok", version=__version__)


@router.get("/health/ready", response_model=ReadyResponse)
def ready_check(response: Response) -> ReadyResponse:
    ''' 의존 서비스까지 포함한 준비 상태 (readiness). 실패시 503'''
    try:
        get_supabase().table("store").select("store_id").limit(1).execute()
    except Exception as exc:
        logger.warning("health.supabase_unreachable", error=str(exc))
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadyResponse(status="error", checks={"supabase": "error"})
    return ReadyResponse(status="ok", checks={"supabase": "ok"})
