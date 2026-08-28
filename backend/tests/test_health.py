from fastapi.testclient import TestClient

from app import __version__
from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}


def test_ready_check_is_registered():
    # DB 에 실제로 붙으므로 200(정상) 또는 503 (DB 불가) 둘 다 정상 동작이다.
    assert client.get("/health/ready").status_code in (200, 503)
