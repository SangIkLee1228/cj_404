from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_me_requires_auth():
    """JWT 없이 보호된 라우트를 호출하면 401을 받는지 확인 (JWT 인증 배선 검증)."""
    response = client.get("/api/me")
    assert response.status_code == 401


def test_me_rejects_invalid_token():
    response = client.get("/api/me", headers={"Authorization": "Bearer not-a-real-jwt"})
    assert response.status_code == 401
