from fastapi.testclient import TestClient

from app.main import app
from app.api.routes.products import CATALOG_FIELDS


def test_is_active_is_not_written_to_the_shared_catalog():
    """is_active를 PRODUCT에 쓰면 한 매장의 판매 중지가 10개 매장 전체로 퍼진다.

    STORE_PRODUCT에만 기록해야 한다 (API명세서 v1.3 · 9장 🔴3).
    """
    assert "is_active" not in CATALOG_FIELDS


client = TestClient(app)


def test_list_products_requires_auth():
    response = client.get("/api/products")
    assert response.status_code == 401


def test_create_product_requires_auth():
    payload = {"store_id": 1, "product_name": "소보루빵",
               "price": "1500", "source_type": "IN_STORE"}
    response = client.post("/api/products", json=payload)
    assert response.status_code == 401
