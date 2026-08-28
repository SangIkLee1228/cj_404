""" Image_Url로 AI 추론하는 로컬 테스트용 FastAPI 서버.

역할 분담:
- predict_module.py   : 모델 init() / predict() / 배치 잡(run_job). predict()는 image_url만으로도
                        이미지 다운로드~상품 ID 매핑까지 자기완결형으로 처리한다(배포본 진입점).
- inference_service.py : 두 곳이 공유하는 부가 로직 (이미지 다운로드 / 상품 ID 매핑 / 임시파일 정리 / 로깅).
- api_server.py       : 위를 HTTP로 노출하는 로컬 개발용 래퍼. OneFlowAI 배포본에서는 사용되지 않는다.

실행:
    python api_server.py
    # 또는
    uvicorn api_server:app --host 0.0.0.0 --port 30007

Swagger UI: http://<host>:30007/docs
ReDoc:      http://<host>:30007/redoc

리버스 프록시(code-server proxy) 하위 경로로 접근하는 경우 ROOT_PATH 상수(또는 동명의
환경변수)로 프리픽스를 지정한다. 예: /user/<id>/ai-wave-team4-snapbbang/codeserver/proxy/30007
"""
from __future__ import annotations

import asyncio
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from inference_service import (
    EXAMPLE_IMAGE_URL,
    TEMP_FILE_TTL_SECONDS,
    TEMP_INPUT_DIR,
    TEMP_OUTPUT_DIR,
    TEMP_SWEEP_INTERVAL_SECONDS,
    configure_logging,
    download_image,
    redact_url,
    sweep_temp_files,
)
from predict_module import init, predict

ROOT_PATH = os.getenv(
    "ROOT_PATH",
    "/user/bigdata-naeya/ai-wave-team4-snapbbang/codeserver/proxy/30007",
)

PORT = 30007

configure_logging()
log = structlog.get_logger("api_server")


async def _temp_sweep_loop() -> None:
    """TEMP_SWEEP_INTERVAL_SECONDS 주기로 sweep_temp_files() 를 실행하는 백그라운드 루프."""
    while True:
        await asyncio.sleep(TEMP_SWEEP_INTERVAL_SECONDS)
        try:
            await run_in_threadpool(sweep_temp_files)
        except Exception as e:  # 루프가 죽지 않도록 방어
            log.warning("temp_sweep_loop_error", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 서버 기동 시 1회만 init() 실행 (모델 로드 등 무거운 초기화)
    TEMP_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    log.info("server_starting", port=PORT)
    init()

    sweep_temp_files()  # 기동 시 이전 실행에서 남은 파일 한번 정리
    sweep_task = asyncio.create_task(_temp_sweep_loop())
    log.info("server_ready", temp_ttl_seconds=TEMP_FILE_TTL_SECONDS)

    try:
        yield
    finally:
        sweep_task.cancel()
        try:
            await sweep_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="SnapBbang Project AI API",
    description="VISION AI를 활용하여 트레이 위의 빵들을 Object Detection API",
    version="1.0.0",
    lifespan=lifespan,
    # root_path=ROOT_PATH,
)


class DetectRequest(BaseModel):
    image_url: str = Field(
        ...,
        description="추론할 이미지의 signed URL. backend는 이 값만 전달한다.",
        examples=[EXAMPLE_IMAGE_URL],
    )

    model_config = {
        "json_schema_extra": {"examples": [{"image_url": EXAMPLE_IMAGE_URL}]}
    }


class DetectResponse(BaseModel):
    status: int
    message: str
    data: dict[str, Any] | None = None
    job_info: dict[str, Any] | None = None


@app.get("/", summary="home")
async def home() -> dict:
    return {"status": "ok"}

@app.get("/health", summary="헬스체크")
async def health() -> dict:
    return {"status": "ok"}

@app.post("/detect", response_model=DetectResponse, summary="빵 탐지 요청")
async def detect(req: DetectRequest) -> dict:
    """backend가 보낸 image_url을 내려받아 predict()에 넘기고 그 반환값을 그대로 응답한다.

    이미지 다운로드 / 상품 ID 매핑은 predict()(=inference_service)가 담당한다. 여기서는
    다운로드 실패만 미리 감지해 502로 매핑하고, 그 외 응답 형태는 predict() 결과를 따른다.
    임시 파일(temp_input/temp_output)은 요청마다 지우지 않고 백그라운드 sweep이 정리한다.
    """
    uuid_id = str(uuid.uuid4())
    structlog.contextvars.bind_contextvars(request_id=uuid_id, image_url=redact_url(req.image_url))
    started = time.perf_counter()
    log.info("detect_request_received")

    input_path = TEMP_INPUT_DIR / f"{uuid_id}.jpg"
    try:
        await run_in_threadpool(download_image, req.image_url, input_path)
    except Exception as e:
        log.warning("detect_download_failed", error=str(e))
        structlog.contextvars.clear_contextvars()
        raise HTTPException(status_code=502, detail=f"이미지 다운로드 실패: {e}") from e

    message: dict[str, Any] = {
        "image_url": req.image_url,
        "image_path": str(input_path),
        "use_batch_job": False,
    }

    try:
        result = await run_in_threadpool(predict, message=message, uuid_id=uuid_id)
    except Exception as e:
        log.exception("detect_predict_error", error=str(e))
        structlog.contextvars.clear_contextvars()
        raise HTTPException(status_code=500, detail=str(e)) from e

    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    detections = (result.get("data") or {}).get("detections") if isinstance(result, dict) else None
    log.info(
        "detect_request_completed",
        result_status=result.get("status") if isinstance(result, dict) else None,
        num_detections=len(detections) if detections is not None else None,
        elapsed_ms=elapsed_ms,
    )

    structlog.contextvars.clear_contextvars()
    return result

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
