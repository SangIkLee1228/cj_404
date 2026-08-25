from typing import Literal

from pydantic import BaseModel

# DB 코드값이 아니라 API 파라미터라 codes.py 가 아니라 여기 둔다.
ImagePurpose = Literal["SCAN", "PRODUCT"]


class ImageUploadResponse(BaseModel):
    ''' POST /api/storage/images 응답 (API 명세서 4.3) '''

    image_path: str
    signed_url: str
    expires_in: int


class SignedUrlResponse(BaseModel):
    ''' GET /api/storage/signed-url 응답 '''

    signed_url: str
    expires_in: int
