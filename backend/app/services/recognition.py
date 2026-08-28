"""AI 추론 서버 연동 (FR-02, API명세서 v1.3 · 4.4).

모델은 사내망에 못 들어오는 자리에 있어서, 팀원 Mac에서 띄운 뒤 ngrok 터널로
노출한 주소를 MODEL_API_URL로 받는다. 트래픽은 한 방향뿐이다 —
    backend --(outbound HTTPS)--> ngrok --> Mac 모델 --(직접 다운로드)--> Supabase
모델이 signed URL을 받아 **자기가** 이미지를 내려받으므로, Mac이 우리 localhost로
들어올 일이 없다. 그래서 nginx/TLS 설정은 건드릴 게 없다.

이 모듈은 DB를 쓰지 않는다(서명 URL 발급 제외). 라우트가 트랜잭션·상태 전이를
맡고, 여기서는 "모델 호출 + 응답을 DB 컬럼 모양으로 변환"만 한다.
"""

from __future__ import annotations

import httpx
import structlog

from app.core.config import get_settings
from app.core.supabase_client import get_supabase

logger = structlog.get_logger("app.services.recognition")

SIGNED_URL_TTL_SECONDS = 600   # 모델이 곧바로 받아가므로 10분이면 충분하다

UNMATCHED_LABEL = "__UNMATCHED__"   # 명세서 4.4: 매칭 실패 시 이 값, product_id는 NULL

# 데모 이미지 목록 조회 상한. 시연용 트레이 사진이 100장을 넘길 일은 없고,
# storage3의 기본 limit도 100이라 그대로 맞췄다.
DEMO_LIST_LIMIT = 100

# 데모 버킷 루트에서 사진으로 인정할 확장자.
_IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png", ".webp")

# ngrok 오류 코드 → failure_reason. 둘 다 "Mac을 확인하라"는 뜻이지만 할 일이 다르다.
#   3200: 에이전트가 ngrok에 연결돼 있지 않다 (절전 / ngrok 종료 / 네트워크 끊김)
#   8012: 터널은 살아 있는데 에이전트가 Mac 안의 모델 서버에 못 닿는다 (서버 미기동)
_NGROK_REASONS = {
    "ERR_NGROK_3200": "TUNNEL_OFFLINE",
    "ERR_NGROK_8012": "MODEL_DOWN",
}


class RecognitionError(Exception):
    """인식 실패. failure_reason으로 그대로 쓰인다.

    예외로 올리지만 라우트는 이걸 HTTP 오류로 바꾸지 않는다 — 명세서 4.4가
    "실패는 HTTP 200 + status=FAILED"라고 못박고 있다. 인식 결과이지 서버 오류가 아니다.
    """

    def __init__(self, reason: str, detail: str = "") -> None:
        super().__init__(detail or reason)
        self.reason = reason
        self.detail = detail


def sign(path: str, bucket: str | None = None) -> str:
    """버킷 내부 경로 → 임시 열람 URL.

    storage.py의 _sign과 같은 일을 하지만 버킷을 골라 받는다. 시연용 테스트
    이미지가 기본 버킷(images)이 아니라 별도 버킷에 올라가 있기 때문이다.
    """
    name = bucket or get_settings().supabase_storage_bucket
    return get_supabase().storage.from_(name).create_signed_url(
        path, SIGNED_URL_TTL_SECONDS
    )["signedURL"]


def _demo_image_paths(bucket: str) -> list[str]:
    """데모 버킷 **루트**의 이미지 경로 목록.

    파일 목록을 설정에 박아두지 않고 매번 조회한다 - Storage에 사진을 올리거나
    지우면 곧바로 시연에 반영되고, .env 수정 + 컨테이너 재생성이 필요 없다.

    루트만 본다(비재귀). 하위 폴더는 id가 없는 항목으로 내려오므로 걸러지며,
    덕분에 원본 보관용 폴더를 같은 버킷에 둬도 시연 대상에 섞이지 않는다.
    Supabase가 빈 폴더에 만들어 두는 .emptyFolderPlaceholder도 확장자에서 걸린다.

    Storage가 이미 이름순으로 주지만 파이썬에서 한 번 더 정렬한다. 사진 선택이
    len(paths)에 대한 나머지 연산이라 목록 순서가 흔들리면 같은 주문인데 촬영할
    때마다 다른 사진이 나온다 - 서버 응답 순서에 기대면 안 되는 이유다.
    """
    entries = get_supabase().storage.from_(bucket).list("", {"limit": DEMO_LIST_LIMIT})
    return sorted(
        entry["name"]
        for entry in entries
        if entry.get("id") and entry["name"].lower().endswith(_IMAGE_SUFFIXES)
    )


def resolve_image_url(session: dict) -> str:
    """이 세션에 대해 모델에 넘길 signed URL을 만든다.

    scan_session.image_url에는 **경로만** 들어 있다(서명 URL은 1시간이면 만료되므로
    저장해두면 나중에 못 쓴다). 그래서 호출 직전에 새로 서명한다.

    경로가 비어 있으면 = 카메라 없이 촬영 버튼만 누른 시연 흐름이다. 이때는
    DEMO_SCAN_IMAGE_BUCKET 루트에 올라와 있는 이미지를 대신 쓴다. 버킷 설정이
    없거나 버킷이 비어 있으면 실패다 - 조용히 넘어가면 "왜 인식이 안 되지"를
    화면만 보고 알 수 없다.
    """
    path = session.get("image_url")
    if path:
        return sign(path)

    bucket = get_settings().demo_scan_image_bucket
    if not bucket:
        raise RecognitionError(
            "NO_IMAGE", "촬영 이미지가 없고 DEMO_SCAN_IMAGE_BUCKET도 비어 있습니다"
        )

    demo = _demo_image_paths(bucket)
    if not demo:
        raise RecognitionError(
            "NO_IMAGE", f"촬영 이미지가 없고 {bucket} 버킷 루트에도 이미지가 없습니다"
        )

    # 어떤 사진을 고를지는 **주문 기준**이다. 세션 기준으로 고르면 다시 촬영할 때마다
    # 새 세션 ID가 나오므로 트레이 사진이 계속 바뀐다 - 같은 트레이를 다시 찍는
    # 동작인데 다른 빵이 나오는 셈이라 시연에서 말이 안 된다.
    #
    # 추가 촬영만 예외로 세션 기준을 쓴다. 트레이에 빵을 더 올리고 다시 찍는
    # 동작이므로 결과가 달라지는 편이 맞고, 여러 번 눌러도 매번 다른 사진이 나온다.
    # order_id가 NULL인 세션은 우리 흐름에 없지만, 컬럼이 nullable이라 대비해 둔다.
    base = (session.get("order_id") or session["scan_session_id"]) % len(demo)

    if session.get("capture_type") == "ADD" and len(demo) > 1:
        # 추가 촬영이 기본 촬영과 같은 사진에 걸리면 같은 빵이 한 번 더 담긴다.
        # 화면상 "촬영할 때마다 수량이 늘어나는" 증상과 구분되지 않으므로, base와
        # 절대 겹치지 않게 1~(n-1) 범위의 오프셋을 더한다. 오프셋이 세션 ID를 따라
        # 돌기 때문에 추가 촬영을 여러 번 눌러도 매번 다른 사진이 나온다.
        offset = 1 + session["scan_session_id"] % (len(demo) - 1)
        index = (base + offset) % len(demo)
    else:
        index = base

    return sign(demo[index], bucket)


def call_detect(image_url: str) -> dict:
    """POST {MODEL_API_URL}/detect. 성공 시 data 딕셔너리를 돌려준다.

    응답 형태(실측):
        {"status": 200, "message": "...", "job_info": null,
         "data": {"image_url": ..., "width": 4032, "height": 3024,
                  "detections": [{"id": 127, "label": "olive_bagel",
                                  "confidence": 0.96, "bbox": [x1, y1, x2, y2]}]}}
    """
    settings = get_settings()
    base = settings.model_api_url.rstrip("/")

    try:
        response = httpx.post(
            f"{base}/detect",
            json={"image_url": image_url},
            timeout=settings.model_api_timeout,
            # ngrok 무료 도메인이 브라우저 UA에 경고 페이지를 끼워 넣는다.
            # httpx는 해당되지 않지만, 에이전트 설정이 바뀌어도 안 깨지게 박아둔다.
            headers={"ngrok-skip-browser-warning": "true"},
        )
    except httpx.TimeoutException as exc:
        raise RecognitionError("TIMEOUT", str(exc)) from exc
    except httpx.HTTPError as exc:
        # 터널이 내려갔을 때가 대부분이다(Mac 절전 / ngrok 종료).
        raise RecognitionError("MODEL_UNREACHABLE", str(exc)) from exc

    # ngrok은 터널이 죽어도 연결 자체는 받아준다 — 자기 오류 페이지를 HTTP 404로
    # 돌려주기 때문에 위의 transport 예외에 걸리지 않는다. 그대로 두면 "모델 서버가
    # 오류를 반환했다"고 안내하게 되는데, 실제로는 Mac을 봐야 하는 상황이라
    # 엉뚱한 곳을 디버깅하게 된다. 응답 헤더의 오류 코드로 구분한다.
    ngrok_error = response.headers.get("ngrok-error-code", "")
    if ngrok_error:
        reason = _NGROK_REASONS.get(ngrok_error, "TUNNEL_ERROR")
        raise RecognitionError(reason, f"{ngrok_error} (HTTP {response.status_code})")

    if response.status_code != 200:
        raise RecognitionError(
            "MODEL_ERROR", f"HTTP {response.status_code}: {response.text[:200]}"
        )

    body = response.json()
    data = body.get("data")
    if not isinstance(data, dict):
        raise RecognitionError("MODEL_ERROR", f"data 없음: {str(body)[:200]}")
    return data


def _normalize_bbox(bbox: object, width: float, height: float) -> dict:
    """모델의 절대 픽셀 [x1, y1, x2, y2] → 명세서 4.4의 정규화 x/y/w/h.

    좌상단 원점, 0~1 스케일. 모델이 박스를 못 준 경우가 있어 전부 None을 허용한다.
    """
    empty = {"bbox_x": None, "bbox_y": None, "bbox_w": None, "bbox_h": None}
    if not isinstance(bbox, list | tuple) or len(bbox) != 4:
        return empty
    if not width or not height:
        return empty

    x1, y1, x2, y2 = (float(v) for v in bbox)
    clamp = lambda v: round(min(max(v, 0.0), 1.0), 6)  # noqa: E731
    return {
        "bbox_x": clamp(x1 / width),
        "bbox_y": clamp(y1 / height),
        "bbox_w": clamp((x2 - x1) / width),
        "bbox_h": clamp((y2 - y1) / height),
    }


def to_detected_rows(scan_session_id: int, data: dict, known_product_ids: set[int]) -> list[dict]:
    """모델 응답 → detected_item INSERT 행 목록.

    변환이 세 군데 필요하다(모델과 우리 스키마의 단위가 다르다):
      1) confidence  0~1  → 0~100 (명세서 4.4)
      2) bbox 절대픽셀    → 0~1 정규화
      3) id              → product_id. 모델이 상품 매핑까지 끝내 보내주므로 그대로 쓰되,
                           우리 product 테이블에 없는 id면 명세서대로 NULL + __UNMATCHED__
    """
    threshold = get_settings().ai_confidence_threshold
    width = float(data.get("width") or 0)
    height = float(data.get("height") or 0)

    rows = []
    for det in data.get("detections") or []:
        confidence = round(float(det.get("confidence") or 0) * 100, 2)
        product_id = det.get("id")
        matched = isinstance(product_id, int) and product_id in known_product_ids

        rows.append(
            {
                "scan_session_id": scan_session_id,
                "product_id": product_id if matched else None,
                "ai_class_label": (det.get("label") or UNMATCHED_LABEL)
                if matched
                else UNMATCHED_LABEL,
                "confidence": confidence,
                "quantity": 1,   # 탐지 1건 = 빵 1개. 합산은 order_item에서 한다
                "is_below_threshold": confidence < threshold,
                **_normalize_bbox(det.get("bbox"), width, height),
            }
        )
    return rows
