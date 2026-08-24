from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_create_scan_session_requires_auth():
    payload = {"store_id": 1, "staff_id": 1, "image_url": "scan/2026-08-20/tray.jpg"}
    response = client.post("/api/scan-sessions", json=payload)
    assert response.status_code == 401


def test_recognize_requires_auth():
    response = client.post("/api/scan-sessions/1/recognize")
    assert response.status_code == 401
