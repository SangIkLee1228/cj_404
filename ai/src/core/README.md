# SnapBbang AI 추론 서버 (`api_server.py`)

`predict_module.py`의 `init()` / `predict()`를 HTTP로 노출하는 FastAPI 서버.
이미지 signed URL을 받아 트레이 위 빵을 Object Detection 하고 결과 JSON을 반환한다.

## 역할 분담

| 파일 | 담당 |
|------|------|
| `predict_module.py` | 모델 `init()` / `predict()` / 배치 잡(`run_job`). `predict()`는 `image_url`만으로도 다운로드~상품 ID 매핑까지 자기완결형으로 처리한다 (**배포본 OneFlowAI 진입점**) |
| `inference_service.py` | `api_server.py`와 `predict_module.py`가 공유하는 부가 로직: 이미지 다운로드(`download_image`), 상품 ID 매핑(`attach_product_ids`), 임시파일 정리(`sweep_temp_files`), 로깅 설정(`configure_logging`) |
| `api_server.py` | 위를 HTTP로 노출하는 **로컬 개발용 래퍼**. OneFlowAI 배포본에서는 실행되지 않는다 |

> **배포본(OneFlowAI)** 은 `api_server.py`를 쓰지 않고 `user-values.yaml`에 매핑된 `predict_module.init`/`predict`만
> 호출한다. 따라서 프로덕션에 필요한 처리는 전부 `predict()`(→ `inference_service`) 안에서 끝나야 하며,
> `api_server.py`에는 HTTP·요청 로깅 등 로컬 전용 관심사만 남긴다.

## 배포 (OneFlowAI)

배포는 **개발환경 안에서 본인 계정으로 커밋**한 뒤 `model/ci` 브랜치로 푸시하면 파이프라인이
컨테이너 이미지 빌드 + 모델 버전 등록을 자동 수행한다. (로컬 PC/다른 계정 푸시는 빌드 실패)

### 1. 진입점 점검 — `src/core/predict_module.py`

- 배포본은 `api_server.py` 없이 `init()` → `predict(message, uuid_id, ...)` 만 호출한다.
- `message`에 `image_path`가 없어도 `image_url`만으로 다운로드·추론·상품ID 매핑까지 끝나야 한다
  (현재 `predict()`가 `inference_service.download_image` / `attach_product_ids`를 직접 호출하므로 충족).
- `use_batch_job` 경로를 쓰면 `VALKEY_STREAM_KEY` 등 배치 환경변수가 필요하다.

### 2. 모델 파일 — `src/core/models/*.onnx`

- `.onnx` 가중치는 git에 안 올라간다(`.gitignore`가 `models/` 제외).
- `src/api/user-values.yaml`의 `copy_folder_list`에 **개발환경 절대경로**로 폴더를 적으면
  빌드 파이프라인이 복제·버저닝한다. 비어있는 폴더는 무시된다.

  ```yaml
  copy_folder_list:
    - /home/jovyan/src/core/models
  ```

  > ⚠️ 현재 파일의 `- /home/jovyan/jovyan/src/core/models` 는 경로 오타(`jovyan` 중복)라 무시된다.
  > `- /home/jovyan/src/core/models` 한 줄만 있으면 된다.

### 3. 패키지 — `src/api/requirements.txt`

- 파이썬 패키지는 파일 **하단**에 추가. 상단 시스템 라이브러리(`fastapi`, `redis`, `psycopg2-binary`)는 삭제 금지.
- 이 서비스가 요구하는 것(이미 반영됨): `structlog`, `onnx`, `onnxslim`, `onnxruntime-gpu==1.23.2`, `opencv-python-headless`.
- `onnxruntime-gpu`는 버전이 CUDA/cuDNN을 강하게 타므로 **핀 버전과 Dockerfile 베이스 이미지를 세트로** 바꾼다.
- 컨테이너 추론 경로에서 안 쓰는 `transformers` / `accelerate` / `beautifulsoup4` 는 주석 처리(슬림화). `bread_clip_pipeline` 로컬 작업 시에만 필요.
- pip 밖의 시스템 패키지는 `src/api/Dockerfile`의 apt 영역에 추가.

### 4. Dockerfile — `src/api/Dockerfile` (GPU 서빙 + 슬림, 이미 반영됨)

- 베이스: `nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04` (cuDNN 9 = `onnxruntime-gpu` 1.23.x 요구사항, `-runtime` 이라 nvcc/헤더 제외). 기존 `base/python:3.11`은 CPU 전용이라 `CUDAExecutionProvider` 로드 실패.
- apt는 런타임 필수만: `python3`(3.10) + `python-is-python3` + `libgl1`/`libglib2.0-0`/`libgomp1` + `locales`.
- `torch`/`torchvision`은 **CPU 휠**로 선설치. 실추론은 `onnxruntime-gpu`가 GPU로 하고 `torch`는 `ultralytics` 후처리에서만 import 되므로 CUDA 빌드 불필요 → 이미지 ~2GB 절감.

  ```dockerfile
  RUN python3 -m pip install --upgrade pip && \
      python3 -m pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision && \
      python3 -m pip install -r requirements.txt
  ```

- `WORKDIR`, `PYTHONPATH=/root/src/core`, `CMD` 는 유지. `src/core/` 코드·모델은 빌드 시 자동 포함되므로 `COPY` 불필요.
- 배포 시 GPU 리소스를 할당해야 CUDA EP가 실제로 잡힌다(로그의 `Using ONNX Runtime ... CUDAExecutionProvider` 확인).
- CPU로 떨어지는지 확인: 배포본 로그에 `CUDAExecutionProvider` 없이 `CPUExecutionProvider`만 뜨면 GPU 미할당 또는 cuDNN 버전 불일치.

### 5. `user-values.yaml` 확인

| 항목 | 확인 |
|------|------|
| `modelDesc` | 이 빌드 버전 설명 (플랫폼 모델 목록에 표시) |
| `aim_id` | 연동할 학습(실험) 버전 ID. 없으면 비움 |
| `copy_folder_list` | 위 2번 참고 |
| `model.*` 블록 | **수정 금지** — 진입 파일/함수 매핑(`predict_module.py` / `init` / `predict`). 잘못 건드리면 빌드는 성공해도 배포·추론이 실패 |

### 6. 빌드 실행

```bash
git add -A && git commit -m "..."          # 개발환경 안에서 본인 계정으로
git push origin master                     # 작업 저장 (빌드 안 됨)
git push origin master:model/ci            # ★ 빌드 트리거
```

- `model/ci` 브랜치는 없어도 위 명령이 원격에 자동 생성한다.
- 진행 상태는 GitLab 파이프라인, 결과는 플랫폼 모델 목록에서 확인.
- 푸시할 때마다 새 모델 버전이 생성된다(빌드 실패해도 버전 번호는 소비됨).

전체 개발환경 가이드는 저장소 루트 `README.md` 참고.

## 배포본 호출 (backend → OneFlowAI)

백엔드가 부르는 대상은 **OneFlowAI가 배포 시 발급하는 추론 엔드포인트**다. 요청 형식은
`oneflowai` SDK(`handler.py`)의 REST 규약을 따른다 — **Body가 그대로 `predict()`의 `message` 인자**가 된다.

### 요청

```
POST  {배포_엔드포인트}/predict
Content-Type: application/json
x-api-key: {콘솔에서 발급된 키}
x-async-mode: false
```

```json
{
  "image_url": "https://<supabase>/storage/v1/object/sign/...?token=...",
  "use_batch_job": false
}
```

- `image_url` — OneFlowAI 서버가 **외부에서 직접 다운로드**한다. 공개 접근 가능한 signed URL이어야 하며,
  백엔드가 이미지 바이트를 올리는 게 아니다.
- `use_batch_job` — `predict()`가 `message.get("use_batch_job", False)`로 읽으므로 생략 가능하지만 명시 권장.
- `x-async-mode: false` → 동기 추론(결과 즉시 반환). `true`면 `result_key`만 받고 따로 폴링해야 한다.
- 배포 상세 화면의 "예시 요청"이 위와 다르면(예: Body를 `{"message": {...}}`로 감쌈) **콘솔 쪽을 정답**으로 삼는다.
  내부 URL(`inference-<project>-<model>-rest...svc.cluster.local`)은 클러스터 내부용이라 로컬 백엔드에서는 못 쓴다 —
  콘솔의 외부(ingress) URL을 사용한다.

### 응답 (`predict()` 반환값 그대로)

```json
{
  "status": 200,
  "message": "UUID <uuid> job is succeded",
  "data": {
    "image_url": "https://...",
    "width": 4032,
    "height": 3024,
    "detections": [
      { "id": 127, "label": "olive_bagel", "confidence": 0.96, "bbox": [x1, y1, x2, y2] }
    ]
  }
}
```

| `status` | 상황 |
|---|---|
| `200` | 성공 |
| `400` | `image_path`/`image_url` 둘 다 없음 |
| `502` | 이미지 다운로드 실패 (URL 만료·권한·네트워크) |
| `500` | 추론 중 예외 |

HTTP 상태코드와 별개로 Body의 `status`도 확인해야 한다.

### 백엔드(FastAPI) 클라이언트 예시

```python
# app/ai_client.py
import os
import httpx

AI_BASE_URL = os.environ["AI_SERVER_URL"].rstrip("/")   # 콘솔의 외부 엔드포인트
AI_PREDICT  = os.getenv("AI_PREDICT_PATH", "/predict")
AI_API_KEY  = os.environ["AI_API_KEY"]

# 배포 직후/스케일업 시 컨테이너 기동+모델 예열(~5s)로 첫 요청이 느릴 수 있음 → timeout 넉넉히
_client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))


async def detect_bread(image_url: str) -> dict:
    resp = await _client.post(
        AI_BASE_URL + AI_PREDICT,
        headers={
            "Content-Type": "application/json",
            "x-api-key": AI_API_KEY,
            "x-async-mode": "false",
        },
        json={"image_url": image_url, "use_batch_job": False},
    )
    resp.raise_for_status()
    body = resp.json()
    if body.get("status") != 200:
        raise RuntimeError(f"AI server error {body.get('status')}: {body.get('message')}")
    return body["data"]
```

```bash
curl -X POST "$AI_SERVER_URL/predict" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $AI_API_KEY" \
  -H "x-async-mode: false" \
  -d '{"image_url":"https://.../IMG_7176.jpg?token=...","use_batch_job":false}'
```

- 서버-투-서버 호출이라 **CORS 설정 불필요**(브라우저에서 직접 부를 때만 필요).
- 로컬 Docker 백엔드는 아웃바운드 HTTPS만 되면 되고, 별도 터널링은 필요 없다(AI→백엔드 콜백 방식을 쓰지 않는 한).

## 실행 (로컬)

```bash
cd src/core
python api_server.py
# 또는
uvicorn api_server:app --host 0.0.0.0 --port 30007
```

- Swagger UI: `http://<host>:30007/docs`
- ReDoc: `http://<host>:30007/redoc`

## 엔드포인트 (로컬 `api_server`)

| Method | Path | 설명 |
|--------|------|------|
| `GET`  | `/` | 헬스체크 (`{"status": "ok"}`) |
| `GET`  | `/health` | 헬스체크 (`{"status": "ok"}`) |
| `POST` | `/detect` | 이미지 URL로 빵 탐지 |

### `POST /detect`

**요청** — backend는 `image_url`만 전달한다.

```json
{ "image_url": "https://<host>/storage/v1/object/sign/test/IMG_7176.jpg?token=..." }
```

**응답** (`predict()`의 반환값을 그대로 전달)

```json
{
  "status": 200,
  "message": "UUID <uuid> job is succeded",
  "data": {
    "image_url": "https://...",
    "width": 4032,
    "height": 3024,
    "detections": [
      { "id": 127, "label": "olive_bagel", "confidence": 0.96, "bbox": [x1, y1, x2, y2] }
    ]
  },
  "job_info": null
}
```

- `id` — `PRODUCT_ID_MAP`(inference_service.py)에서 `label`로 찾은 상품 ID (아래 표). 매핑에 없으면 `null`(로그에 `product_id_unmapped` 경고).
- `bbox`는 원본 이미지 픽셀 좌표 `[x1, y1, x2, y2]`.
- detection 키 순서: `id`, `label`, `confidence`, `bbox`.
- Swagger `/docs`의 "Try it out"에는 동작하는 예제 URL이 미리 채워져 있다(`EXAMPLE_IMAGE_URL`).

**에러 응답**

| status | 상황 |
|--------|------|
| `502` | 이미지 다운로드 실패 (URL 만료·권한 오류·네트워크 오류) |
| `500` | `predict()` 실행 중 예외 |

## 상품 ID 매핑 (`inference_service.attach_product_ids`)

`predict()` 응답의 각 detection에 `label` 기준 상품 ID를 `id` 키로 주입한다(맨 앞 키).
매핑은 `inference_service.py`의 `PRODUCT_ID_MAP` 상수에 정의한다. `predict()`가 반환 직전에
직접 호출하므로 배포본·로컬 응답 모두 `id`가 붙는다. 이미 `id`가 있어도 재호출 시 동일 결과(idempotent).

| label | id |
|-------|----|
| `choco_swirl_bread` | 137 |
| `kimchi_croquette` | 210 |
| `olive_bagel` | 127 |
| `red_bean_bun` | 174 |
| `strawberry_donut` | 201 |
| `twist_donut` | 202 |

- 매핑에 없는 label → `id: null`, 로그에 `product_id_unmapped` 경고.
- 클래스/상품이 바뀌면 이 상수만 수정하면 된다.

## 요청 처리 흐름

**로컬 (`api_server.py`)**

```
POST /detect
  └─ uuid 생성 (request_id)
  └─ inference_service.download_image(image_url) → data/temp_input/<uuid>.jpg   # 다운로드 실패만 미리 502로 매핑
  └─ predict(message={image_url, image_path, use_batch_job:False}, uuid_id)
        └─ ONNX 추론 → data/temp_output/<uuid>.json 저장
        └─ inference_service.attach_product_ids(result) → 각 detection에 "id" 주입
  └─ 결과 dict 그대로 응답
```

**배포본 (OneFlowAI)** — `api_server.py` 없이 `predict()`만 호출된다.

```
predict(message={image_url, use_batch_job:False}, uuid_id)
  └─ image_path 없음 → inference_service.download_image(image_url) → data/temp_input/<uuid>.jpg
  └─ ONNX 추론 → data/temp_output/<uuid>.json 저장
  └─ inference_service.attach_product_ids(result) → 각 detection에 "id" 주입
  └─ 결과 dict 반환
```

`predict()`는 `message["image_path"]`가 있으면 그대로 쓰고, 없으면 `message["image_url"]`을 직접 내려받는다.
다운로드 실패 시 `status: 502`, `image_path`/`image_url` 둘 다 없으면 `status: 400`을 반환한다.

## 이미지 다운로드 재시도 정책 (`inference_service.download_image`)

| 상수 | 기본값 | 의미 |
|------|--------|------|
| `DOWNLOAD_TIMEOUT` | `10` | 시도당 타임아웃(초). signed URL 만료(1~5분)보다 짧게. |
| `DOWNLOAD_MAX_ATTEMPTS` | `3` | 최대 시도 횟수 |
| `DOWNLOAD_BACKOFF_BASE` | `0.5` | 재시도 간격(초): 0.5 → 1.0 → 2.0 |

- **4xx**(만료된 signed URL, 권한 오류)는 재시도해도 소용없으므로 즉시 실패.
- 타임아웃 / 연결 오류 / 5xx 만 재시도.

## 임시 파일 정리 (sweep)

요청마다 삭제하지 않고, **mtime 기준으로 오래된 파일을 주기적으로 쓸어낸다.**

| 환경변수 | 기본값 | 의미 |
|----------|--------|------|
| `TEMP_FILE_TTL_SECONDS` | `3600` (1시간) | 마지막 수정 후 이 시간이 지난 파일 삭제 |
| `TEMP_SWEEP_INTERVAL_SECONDS` | `600` (10분) | sweep 실행 주기 |

- 기동 시 1회 sweep → 이전 실행에서 남은 파일 정리 (`api_server` lifespan / 배포본은 `predict_module.init`).
- `api_server`는 이후 `TEMP_SWEEP_INTERVAL_SECONDS` 주기로 백그라운드 루프 실행 (배포본에는 이 루프가 없다).
- 대상: `data/temp_input/*`, `data/temp_output/*`.
- best-effort — 개별 삭제 실패는 로깅만 하고 계속 진행.

## 로깅 (structlog)

| 환경변수 | 기본값 | 의미 |
|----------|--------|------|
| `LOG_LEVEL` | `INFO` | 로그 레벨 |
| `LOG_JSON` | 자동 | `1`/`true`면 JSON, 미설정 시 tty면 콘솔·아니면 JSON |

- 요청마다 `request_id`(uuid)와 `image_url`을 `contextvars`로 바인딩 → 해당 요청의 모든 로그에 자동 첨부.
- **signed URL의 토큰(query)은 로그에서 제거**된다(`inference_service.redact_url`). 응답 body의 `image_url`은 그대로 유지.
- 로깅 설정은 `inference_service.configure_logging()` 1곳에서 하며, `api_server`·`inference_service` import 시 자동 실행된다(2회차부터 무시).

주요 이벤트:

| 이벤트 | 시점 |
|--------|------|
| `server_starting` / `server_ready` | 기동 |
| `detect_request_received` | 요청 진입 |
| `image_download_retry` | 다운로드 재시도 |
| `detect_download_failed` | 다운로드 최종 실패 (→ 502) |
| `detect_predict_error` | `predict()` 예외 (→ 500, traceback 포함) |
| `product_id_unmapped` | `PRODUCT_ID_MAP`에 없는 label 탐지됨 (`labels`) |
| `detect_request_completed` | 정상 종료 (`result_status`, `num_detections`, `elapsed_ms`) |
| `temp_sweep_done` | 임시 파일 정리 (`removed`, `ttl_seconds`) |

## 리버스 프록시 (code-server proxy) 하위 경로

`.../codeserver/proxy/30007/docs` 처럼 하위 경로로 접근하면 Swagger가 `/openapi.json`을 못 찾아
"Failed to load API definition"이 뜬다. `ROOT_PATH`로 프리픽스를 지정한다.

| 환경변수 | 기본값 |
|----------|--------|
| `ROOT_PATH` | `/user/bigdata-naeya/ai-wave-team4-snapbbang/codeserver/proxy/30007` |

```bash
ROOT_PATH=/user/<id>/ai-wave-team4-snapbbang/codeserver/proxy/30007 python api_server.py
```

이 값이 `FastAPI(root_path=...)`로 들어가 Swagger UI의 openapi 링크와 `servers` URL에 프리픽스가 붙는다.

## 모델 로드 (`predict_module.init`)

- `models/` 안의 **`*.onnx` 파일을 파일명 무관하게** 로드한다(`MODEL_GLOB = "*.onnx"`).
- 파일이 없으면 `FileNotFoundError`, 여러 개면 이름순 첫 번째를 사용하고 경고 출력.
- 기동 시 더미 이미지로 예열(warmup)하여 첫 요청 지연을 없앤다.

## 관련 환경변수 요약

| 환경변수 | 기본값 | 용도 |
|----------|--------|------|
| `ROOT_PATH` | (위 참고) | 리버스 프록시 프리픽스 |
| `LOG_LEVEL` | `INFO` | 로그 레벨 |
| `LOG_JSON` | 자동 | 로그 포맷 (JSON / 콘솔) |
| `TEMP_FILE_TTL_SECONDS` | `3600` | 임시 파일 보존 시간 |
| `TEMP_SWEEP_INTERVAL_SECONDS` | `600` | sweep 주기 |
| `VALKEY_STREAM_KEY` | — | 배치 잡(`use_batch_job=True`) 등록용 (predict_module) |

## 로컬 테스트

```bash
cd src/core
python test_inference.py
```

`test_inference.py`는 `inference_service.download_image`로 이미지를 받은 뒤 `predict()`에
`image_path`를 넘겨 `init → predict` 흐름을 확인한다. `image_path` 없이 `image_url`만 넘기면
`predict()`가 직접 내려받는 배포본 경로도 그대로 테스트할 수 있다.

## 의존 패키지

`src/api/requirements.txt`에 정의. 이 서버 관련으로 추가된 것:

- `structlog` — 구조화 로깅
- `onnx`, `onnxslim`, `onnxruntime-gpu` — ONNX 모델 추론
- `opencv-python-headless` — GUI 라이브러리 없는 환경용 (일반 `opencv-python` 사용 금지: `libxcb.so.1` 오류)
