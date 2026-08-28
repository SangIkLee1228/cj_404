""" api_server.py 와 predict_module.py 가 공유하는 프로덕션 추론 부가 로직.

배포본(OneFlowAI)은 api_server.py 를 사용하지 않고 predict_module.predict() 만 호출하므로,
이미지 다운로드 / 상품 ID 매핑 / 임시파일 정리처럼 "추론 전후에 반드시 필요한 처리"를
여기에 모아 두고 두 곳(로컬 FastAPI 래퍼 · 배포본 predict())에서 동일하게 재사용한다.

담당:
- download_image()      signed URL -> 로컬 파일 (재시도 포함)
- attach_product_ids()  탐지 label -> 상품 ID 를 detection 에 주입
- sweep_temp_files()    temp_input / temp_output 의 오래된 파일 정리
- configure_logging()   structlog 1회 설정 (import 시 자동 호출)
"""
from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import requests
import structlog

BASE_DIR = Path(__file__).parent
TEMP_INPUT_DIR = BASE_DIR / "data" / "temp_input"
TEMP_OUTPUT_DIR = BASE_DIR / "data" / "temp_output"

# 이미지 다운로드 재시도 정책 - signed URL 만료(1~5분)보다 훨씬 짧게 잡는다.
DOWNLOAD_TIMEOUT = 10  # 시도당 타임아웃(초)
DOWNLOAD_MAX_ATTEMPTS = 3
DOWNLOAD_BACKOFF_BASE = 0.5  # 재시도 간격(초): 0.5 -> 1.0 -> 2.0

# temp_input/temp_output 정리: 요청별 삭제 대신 mtime 기준으로 오래된 파일을 주기적으로 쓸어낸다.
TEMP_FILE_TTL_SECONDS = int(os.getenv("TEMP_FILE_TTL_SECONDS", str(60 * 60)))  # 1시간 지난 파일 삭제
TEMP_SWEEP_INTERVAL_SECONDS = int(os.getenv("TEMP_SWEEP_INTERVAL_SECONDS", str(10 * 60)))  # 10분마다

EXAMPLE_IMAGE_URL = (
    "https://aywnlwqnjgvtcnxwuoxc.supabase.co/storage/v1/object/sign/test/IMG_7176.jpg"
    "?token=eyJraWQiOiJkYTJlZmEyZC0yOTFhLTQ3NGMtOWYwZi03MzgwNTYwYmY4MmUiLCJhbGciOiJIUzI1NiJ9"
    ".eyJ1cmwiOiJ0ZXN0L0lNR183MTc2LmpwZyIsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3ODc3MzkxNTcsImV4cCI6MTc4ODM0Mzk1N30"
    ".5IR5Ozt66kcu2vA7uXevC4XeYzhoyaA40CGlmEftGo8"
)

#: 탐지 label -> 상품 ID 매핑. 응답의 각 detection 에 "id" 로 주입된다.
#: 매핑에 없는 label 은 id=None 으로 응답한다(로그에 product_id_unmapped 경고).
PRODUCT_ID_MAP: dict[str, int | None] = {
    "choco_swirl_bread": 137,
    "kimchi_croquette": 210,
    "olive_bagel": 127,
    "red_bean_bun": 174,
    "strawberry_donut": 201,
    "twist_donut": 202,
}


class ImageDownloadError(RuntimeError):
    """이미지 다운로드 실패. 호출 측(api_server)은 이를 HTTP 502 로 매핑한다."""


# ---------------------------------------------------------------------------
# 로깅 설정 (structlog)
# ---------------------------------------------------------------------------
_logging_configured = False


def configure_logging() -> None:
    """structlog 을 1회 설정한다. 두 번째 호출부터는 무시한다.

    LOG_LEVEL(기본 INFO), LOG_JSON(기본: 터미널이면 콘솔, 아니면 JSON) 환경변수로 제어.
    """
    global _logging_configured
    if _logging_configured:
        return

    level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)

    json_env = os.getenv("LOG_JSON")
    use_json = (json_env.lower() in ("1", "true", "yes")) if json_env else not sys.stdout.isatty()
    renderer = (
        structlog.processors.JSONRenderer()
        if use_json
        else structlog.dev.ConsoleRenderer()
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    _logging_configured = True


configure_logging()
log = structlog.get_logger("inference_service")


# ---------------------------------------------------------------------------
# 이미지 다운로드
# ---------------------------------------------------------------------------
def redact_url(url: str) -> str:
    """로그에 signed URL의 토큰(query)이 남지 않도록 쿼리스트링을 제거한다."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def download_image(url: str, save_path: Path | str) -> Path:
    """signed URL에서 이미지를 다운로드해 save_path에 저장하고 그 경로를 반환한다.

    4xx(만료된 signed URL, 권한 오류 등)는 재시도해도 성공할 수 없으므로 즉시 실패 처리하고,
    타임아웃/연결 오류/5xx처럼 일시적일 수 있는 실패만 재시도한다.
    실패 시 ImageDownloadError 를 던진다.
    """
    save_path = Path(save_path)
    save_path.parent.mkdir(parents=True, exist_ok=True)

    last_error = None
    for attempt in range(1, DOWNLOAD_MAX_ATTEMPTS + 1):
        try:
            resp = requests.get(url, timeout=DOWNLOAD_TIMEOUT)
            if 400 <= resp.status_code < 500:
                raise ImageDownloadError(
                    f"이미지 다운로드 실패 (URL 만료/권한 오류 가능): HTTP {resp.status_code}"
                )
            resp.raise_for_status()
            save_path.write_bytes(resp.content)
            log.debug("image_downloaded", attempt=attempt, bytes=len(resp.content))
            return save_path
        except ImageDownloadError:
            raise
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError) as e:
            last_error = e
            log.warning("image_download_retry", attempt=attempt, error=str(e))

        if attempt < DOWNLOAD_MAX_ATTEMPTS:
            time.sleep(DOWNLOAD_BACKOFF_BASE * (2 ** (attempt - 1)))

    raise ImageDownloadError(
        f"이미지 다운로드 {DOWNLOAD_MAX_ATTEMPTS}회 시도 후 실패: {last_error}"
    )


# ---------------------------------------------------------------------------
# 상품 ID 매핑
# ---------------------------------------------------------------------------
def attach_product_ids(result: dict) -> dict:
    """result["data"]["detections"] 각 항목 맨 앞에 label 기준 product id를 "id"로 추가한다.

    이미 "id"가 있는 항목에 다시 호출해도 동일한 결과가 되도록 idempotent 하게 동작한다.
    """
    data = result.get("data") if isinstance(result, dict) else None
    if not isinstance(data, dict):
        return result
    detections = data.get("detections")
    if not isinstance(detections, list):
        return result

    rebuilt = []
    for det in detections:
        if not isinstance(det, dict):
            continue
        rest = {k: v for k, v in det.items() if k != "id"}
        rebuilt.append({"id": PRODUCT_ID_MAP.get(det.get("label")), **rest})
    data["detections"] = rebuilt

    unmapped = sorted(
        {det["label"] for det in rebuilt if det.get("id") is None and det.get("label")}
    )
    if unmapped:
        log.warning("product_id_unmapped", labels=unmapped)
    return result


# ---------------------------------------------------------------------------
# 임시파일 정리
# ---------------------------------------------------------------------------
def sweep_temp_files(ttl_seconds: int = TEMP_FILE_TTL_SECONDS) -> int:
    """temp_input/temp_output 에서 마지막 수정 시각이 ttl_seconds 이상 지난 파일을 삭제한다.

    best-effort - 개별 파일 삭제 실패는 로깅만 하고 계속 진행한다. 삭제한 파일 수를 반환.
    """
    cutoff = time.time() - ttl_seconds
    removed = 0
    for directory in (TEMP_INPUT_DIR, TEMP_OUTPUT_DIR):
        if not directory.is_dir():
            continue
        for path in directory.iterdir():
            try:
                if path.is_file() and path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)
                    removed += 1
            except OSError as e:
                log.warning("temp_sweep_failed", path=str(path), error=str(e))
    if removed:
        log.info("temp_sweep_done", removed=removed, ttl_seconds=ttl_seconds)
    return removed
