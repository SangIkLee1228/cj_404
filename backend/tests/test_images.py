"""image_url -> 서명 URL 변환 (app/core/images.py).

DB에 저장된 값이 세 가지 모양으로 섞여 있을 수 있어, 각각을 어떻게 다루는지 못박는다.
네트워크를 타지 않는 순수 함수만 검증한다.
"""

from app.core.images import object_path, with_signed_images
from app.schemas.common import ProductRead

BUCKET_URL = "https://demo.supabase.co/storage/v1/object/public/images/"


def _product(image_url: str | None) -> ProductRead:
    return ProductRead(
        product_id=1,
        product_name="소금빵",
        product_type="BREAD",
        price=3200,
        source_type="IN_STORE",
        image_url=image_url,
        is_active=True,
    )


def test_public_url_yields_object_path():
    """실제 시드 데이터의 모양. 마커 뒤 경로만 남아야 한다."""
    assert object_path(BUCKET_URL + "products/donut-croquette/3879.png") == (
        "products/donut-croquette/3879.png"
    )


def test_bare_path_passes_through():
    """POST /storage/images가 돌려주는 경로 형태."""
    assert object_path("scan/2026/08/25/abc.jpg") == "scan/2026/08/25/abc.jpg"
    assert object_path("/scan/2026/08/25/abc.jpg") == "scan/2026/08/25/abc.jpg"


def test_foreign_url_is_left_alone():
    """우리 버킷이 아닌 이미지는 서명할 수 없다. 건드리지 않는다."""
    assert object_path("https://cdn.example.com/bread.png") is None


def test_missing_url_is_none():
    assert object_path(None) is None
    assert object_path("") is None


def test_disabled_by_default_returns_originals():
    """SIGN_IMAGE_URLS 기본값은 false다. 켜기 전까지 응답이 바뀌면 안 된다."""
    original = BUCKET_URL + "products/bread/1.jpg"
    items = with_signed_images([_product(original)])
    assert items[0].image_url == original
