"""상품 이미지 URL 처리 (API명세서 4.2 · 9장).

DB의 `PRODUCT.image_url`에는 Supabase Storage의 **공개 URL이 통째로** 들어 있다.

    https://<project>.supabase.co/storage/v1/object/public/images/products/…/3879.png

버킷이 public인 동안은 이 URL을 그대로 내려주면 브라우저가 잘 렌더한다. 문제는
버킷을 private으로 바꾸는 순간이다. 같은 URL이 403이 되고 상품 이미지가 전부
깨지는데, 원인이 백엔드 코드에는 없어서 찾기 어렵다.

그래서 "URL에서 버킷 내부 경로만 뽑아 서명 URL로 바꾸는" 변환을 미리 만들어 둔다.
다만 `SIGN_IMAGE_URLS` 설정이 켜졌을 때만 동작한다. 기본값은 꺼짐이므로 지금
응답은 한 글자도 바뀌지 않는다. 버킷을 잠그는 날 환경변수 하나만 켜면 된다.

한 건씩 서명하지 않는 이유: 상품이 92종이면 HTTP 요청이 92번이다. Storage의
배치 API로 목록 하나당 한 번만 호출한다.
"""

from collections.abc import Sequence
from typing import TypeVar

import structlog

from app.core.config import get_settings
from app.core.supabase_client import get_supabase

logger = structlog.get_logger("app.images")

SIGNED_URL_TTL_SECONDS = 3600  # storage.py와 같은 1시간

# 공개 URL의 고정 구간. 이 뒤부터가 버킷 이름과 객체 경로다.
_PUBLIC_MARKER = "/storage/v1/object/public/"

# image_url 속성을 가진 pydantic 응답 모델이면 무엇이든 받는다.
ModelT = TypeVar("ModelT")


def object_path(image_url: str | None) -> str | None:
    """image_url에서 버킷 내부 경로만 뽑는다. 서명할 수 없으면 None.

    세 가지 입력을 구분한다:
        1) 우리 버킷의 공개 URL  → 마커 뒤 경로를 반환
        2) 그 외 http(s) URL     → None (외부 이미지는 건드리지 않는다)
        3) 경로 문자열           → 그대로 (앞 슬래시만 제거)
    """
    if not image_url:
        return None

    marker = f"{_PUBLIC_MARKER}{get_settings().supabase_storage_bucket}/"
    if marker in image_url:
        return image_url.split(marker, 1)[1]

    if image_url.startswith(("http://", "https://")):
        return None

    return image_url.lstrip("/")


def _absolute(signed: str) -> str:
    """storage3 버전에 따라 상대 경로를 돌려주기도 해서 절대 URL로 맞춘다."""
    if signed.startswith(("http://", "https://")):
        return signed
    base = get_settings().supabase_url.rstrip("/")
    return f"{base}/storage/v1/{signed.lstrip('/')}"


def sign_paths(paths: Sequence[str]) -> dict[str, str]:
    """경로 목록을 한 번의 호출로 서명한다. {경로: 서명 URL}.

    실패해도 예외를 올리지 않는다 - 이미지가 안 보이는 것과 목록 API 전체가
    500이 되는 것은 심각도가 다르다. 실패하면 빈 dict를 주고 호출부가 원본을 쓴다.
    """
    if not paths:
        return {}

    bucket = get_supabase().storage.from_(get_settings().supabase_storage_bucket)
    try:
        results = bucket.create_signed_urls(list(paths), SIGNED_URL_TTL_SECONDS)
    except Exception:  # noqa: BLE001 - 이미지 때문에 목록을 죽이지 않는다
        logger.warning("images.sign_failed", count=len(paths), exc_info=True)
        return {}

    signed: dict[str, str] = {}
    for path, result in zip(paths, results or [], strict=False):
        url = result.get("signedURL") or result.get("signedUrl")
        if result.get("error") or not url:
            continue
        signed[result.get("path") or path] = _absolute(url)
    return signed


def with_signed_images(items: Sequence[ModelT]) -> list[ModelT]:
    """image_url을 가진 응답 모델들의 URL을 서명 URL로 바꾼다.

    설정이 꺼져 있으면(기본값) 원본을 그대로 돌려준다.
    """
    items = list(items)
    if not get_settings().sign_image_urls or not items:
        return items

    paths = {
        path
        for item in items
        if (path := object_path(getattr(item, "image_url", None))) is not None
    }
    signed = sign_paths(sorted(paths))
    if not signed:
        return items

    result = []
    for item in items:
        path = object_path(getattr(item, "image_url", None))
        url = signed.get(path) if path else None
        result.append(item.model_copy(update={"image_url": url}) if url else item)
    return result


def with_signed_image(item: ModelT) -> ModelT:
    """단건용. 목록과 같은 규칙을 쓴다."""
    return with_signed_images([item])[0]
