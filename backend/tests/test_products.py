from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_list_products_requires_auth():
    response = client.get("/api/products")
    assert response.status_code == 401


def test_create_product_requires_auth():
    payload = {"store_id": 1, "product_name": "소보루빵", "price": "1500", "source_type": "IN_STORE"}
    response = client.post("/api/products", json=payload)
    assert response.status_code == 401
