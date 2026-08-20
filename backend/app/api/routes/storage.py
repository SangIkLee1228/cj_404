import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.core.security import CurrentUser, get_current_user
from app.core.supabase_client import get_supabase

router = APIRouter(prefix="/storage", tags=["storage"])


@router.post("/upload")
async def upload_image(file: UploadFile, user: CurrentUser = Depends(get_current_user)):
    """Example: upload an image to Supabase Storage and return its path.

    Boilerplate only - callers are expected to persist the returned `path`
    against their own domain rows (e.g. a scan-session or product-image record)
    and re-sign a fresh URL at read time rather than storing a long-lived
    public URL.
    """
    settings = get_settings()
    supabase = get_supabase()

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only image uploads are supported")

    extension = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
    path = f"{user.id}/{uuid.uuid4()}.{extension}"

    contents = await file.read()
    supabase.storage.from_(settings.supabase_storage_bucket).upload(
        path, contents, {"content-type": file.content_type}
    )

    return {"path": path}


@router.get("/signed-url")
def get_signed_url(path: str, user: CurrentUser = Depends(get_current_user)):
    """Example: mint a short-lived URL for a previously uploaded object path."""
    settings = get_settings()
    supabase = get_supabase()

    result = supabase.storage.from_(settings.supabase_storage_bucket).create_signed_url(path, 60 * 60)
    return {"url": result["signedURL"]}
