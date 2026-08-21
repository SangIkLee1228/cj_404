import time
import uuid

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.router import api_router
from app.api.routes import health
from app.core.config import get_settings
from app.core.logging import configure_logging

configure_logging()
settings = get_settings()
logger = structlog.get_logger("app.request")

app = FastAPI(
    title="SnapBbang API",
    description=(
        "스냅빵(SnapBbang) - 뚜레쥬르 Vision AI 기반 빵 인식·계산·"
        "재고 운영 최적화 시스템 백엔드 API (학습/제안용 프로젝트, 실제 CJ푸드빌 운영 서비스 아님)"
    ),
    version="0.1.0",
    # nginx는 "/api/*"만 backend로 프록시하므로, 문서도 /api 아래에서 서빙해야
    # https://localhost/api/docs 로 접근 가능하다 (팀 Docker/Nginx 가이드 최종 구성 기준).
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",

    # 밑에 Swagger (/docs) 주석을 직접 달 수 있습니다!
    openapi_tags=[
        {"name": "health",
            "description": "인프라 헬스체크 (Docker/모니터링 전용, nginx 미경유)"},
        {"name": "auth", "description": "Supabase Auth로 발급된 JWT 검증 예시"},
        {"name": "storage", "description": "Supabase Storage 이미지 업로드 / 서명 URL 예시"},
        {"name": "products", "description": "상품(빵) 마스터 관리 (FR-16)"},
        {"name": "scan",
            "description": "트레이 스캔 · AI 인식 연동 지점 (FR-01/02, 추론은 stub)"},
        {"name": "inventory",
            "description": "재고 대시보드 (FR-13, 참고 정보 - 자동 발주 아님)"},
        {"name": "notifications", "description": "매진 임박 수량 알림 (FR-15)"},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    structlog.contextvars.clear_contextvars()
    trace_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    structlog.contextvars.bind_contextvars(trace_id=trace_id)

    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)

    logger.info(
        "http.request_completed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=duration_ms,
    )
    response.headers["X-Request-ID"] = trace_id
    return response


# 인프라 전용 엔드포인트 - "/api" prefix 밖에 두어 nginx를 거치지 않고
# Docker 헬스체크/Prometheus가 내부망에서 직접 호출하게 한다.
app.include_router(health.router)

# 공개 REST API
app.include_router(api_router)

Instrumentator().instrument(app).expose(
    app, endpoint="/metrics", include_in_schema=False)
