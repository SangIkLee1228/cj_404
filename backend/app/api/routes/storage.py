import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status

from app.core.config import get_settings
from app.core.security import CurrentUser, get_current_user
from app.core.supabase_client import get_supabase
from app.core.timeutil import kst_today
from app.schemas.storage import ImagePurpose, ImageUploadResponse, SignedUrlResponse

router = APIRouter(prefix="/storage", tags=["storage"])

# content-type -> 확장자. 파일명 대신 이걸 신뢰한다 (이유는 아래 설명).
ALLOWED_CONTENT_TYPES = {"image/jpeg": "jpg", "image/png": "png"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024          # 명세서 4.3
SIGNED_URL_TTL_SECONDS = 3600               # 1시간
PURPOSE_FOLDER: dict[str, str] = {"SCAN": "scan", "PRODUCT": "product"}


def _object_path(purpose: ImagePurpose, extension: str) -> str:
    """scan/2026/08/25/{uuid}.jpg 형태의 저장 경로를 만든다."""
    return f"{PURPOSE_FOLDER[purpose]}/{kst_today():%Y/%m/%d}/{uuid.uuid4()}.{extension}"


def _sign(path: str) -> str:
    """비공개 버킷의 객체에 대한 임시 열람 URL을 발급한다."""
    bucket = get_supabase().storage.from_(get_settings().supabase_storage_bucket)
    return bucket.create_signed_url(path, SIGNED_URL_TTL_SECONDS)["signedURL"]


@router.post("/images", response_model=ImageUploadResponse)
async def upload_image(
    file: UploadFile,
    purpose: ImagePurpose = Query(default="SCAN"),
    user: CurrentUser = Depends(get_current_user),
) -> ImageUploadResponse:
    """트레이 스캔 / 상품 이미지 업로드 (FR-01, FR-16)."""
    extension = ALLOWED_CONTENT_TYPES.get(file.content_type or "")
    if extension is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "JPEG 또는 PNG 이미지만 업로드할 수 있습니다.",
        )

    contents = await file.read()
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "이미지 크기는 10MB를 넘을 수 없습니다.",
        )

    path = _object_path(purpose, extension)
    bucket = get_supabase().storage.from_(get_settings().supabase_storage_bucket)
    bucket.upload(path, contents, {"content-type": file.content_type})

    return ImageUploadResponse(
        image_path=path,
        signed_url=_sign(path),
        expires_in=SIGNED_URL_TTL_SECONDS,
    )


@router.get("/signed-url", response_model=SignedUrlResponse)
def get_signed_url(
    path: str = Query(..., min_length=1),
    user: CurrentUser = Depends(get_current_user),
) -> SignedUrlResponse:
    """만료된 서명 URL 재발급. DB에는 경로만 저장되므로 조회 시마다 필요하다."""
    return SignedUrlResponse(signed_url=_sign(path), expires_in=SIGNED_URL_TTL_SECONDS)
