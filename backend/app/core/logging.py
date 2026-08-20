import logging
import sys

import structlog

from app.core.config import get_settings

SERVICE_NAME = "snapbbang-backend"
APP_VERSION = "0.1.0"


def _inject_service_fields(logger, method_name, event_dict):
    settings = get_settings()
    event_dict.setdefault("service", SERVICE_NAME)
    event_dict.setdefault("env", settings.environment)
    event_dict.setdefault("app_version", APP_VERSION)
    return event_dict


def configure_logging() -> None:
    """팀 컨벤션(Notion "StructLog" 페이지)에 따른 구조화 로깅 설정.

    - _common(timestamp/level/event/service/env/app_version/trace_id)은 processor가 자동 주입하며
      코드에서 직접 채우지 않는다.
    - _context(예: store_id, staff_id, scan_session_id)는 요청 스코프 진입 시
      structlog.contextvars.bind_contextvars()로 1회 바인딩하면 같은 요청 내 모든 로그에
      자동 전파된다 (app/main.py의 trace_id 바인딩, app/api/routes/scan_sessions.py 참고).
    - 이벤트명은 "{도메인}.{동작}" 형태를 따른다 (예: scan.captured, order.paid).
    - 상태 변경성 감사(audit) 로그는 여기(파일/stdout 로그)가 아니라 별도 DB 테이블에 남긴다
      (CORRECTION_LOG가 이미 이 원칙을 구현한 append-only 테이블).
    """
    settings = get_settings()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).setLevel(level)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True, key="timestamp"),
            _inject_service_fields,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
