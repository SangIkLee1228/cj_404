"""표준 에러 응답 형태 검증 (API명세서 v1.2 · 1.4).

모든 오류가 { "error": { code, message, details?, trace_id? } } 로 나가야 한다.
FastAPI 기본값인 { "detail": "..." } 가 새어 나가면 FE가 code로 분기할 수 없다.
"""

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.errors import ApiError, register_exception_handlers
from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def _error(response) -> dict:
    body = response.json()
    assert "error" in body, f"표준 형태가 아니다: {body}"
    assert "detail" not in body, "FastAPI 기본 형태가 새어 나갔다"
    return body["error"]


def test_unauthorized_uses_standard_shape():
    res = client.get("/api/products")
    assert res.status_code == 401
    err = _error(res)
    assert err["code"] == "UNAUTHORIZED"
    assert isinstance(err["message"], str) and err["message"]


def test_validation_error_carries_details():
    """인증 의존성이 경로 파라미터 검증보다 먼저 돌기 때문에,
    실제 라우트로는 401이 먼저 나온다. 검증 핸들러만 따로 확인한다."""
    probe = FastAPI()
    register_exception_handlers(probe)

    @probe.get("/items/{item_id}")
    def _item(item_id: int):  # noqa: ARG001
        return {}

    res = TestClient(probe, raise_server_exceptions=False).get("/items/not-an-int")
    assert res.status_code == 422
    err = _error(res)
    assert err["code"] == "VALIDATION_ERROR"
    assert err["details"], "어느 필드가 틀렸는지 알려줘야 한다"
    assert "field" in err["details"][0] and "reason" in err["details"][0]


def test_trace_id_echoes_request_header():
    given = "11111111-2222-3333-4444-555555555555"
    res = client.get("/api/products", headers={"X-Request-ID": given})
    assert res.headers["X-Request-ID"] == given
    assert _error(res)["trace_id"] == given


def test_response_always_has_request_id():
    res = client.get("/health")
    assert res.headers.get("X-Request-ID")


# --------------------------------------------------------------------------
# ApiError: 같은 상태코드에 여러 의미가 있을 때 code로 구분한다
# --------------------------------------------------------------------------
def _probe_app() -> TestClient:
    probe = FastAPI()
    register_exception_handlers(probe)

    @probe.get("/shortage")
    def _shortage():
        raise ApiError(
            409,
            "INVENTORY_SHORTAGE",
            "소금빵의 잔여 수량이 부족합니다 (요청 5, 잔여 2)",
            details=[{"field": "items[0].quantity", "reason": "exceeds_remaining"}],
        )

    @probe.get("/already-paid")
    def _already_paid():
        raise HTTPException(409, "이미 결제된 주문입니다")

    return TestClient(probe, raise_server_exceptions=False)


def test_same_status_different_codes():
    """409 두 개가 code로 갈려야 FE가 다르게 처리할 수 있다."""
    probe = _probe_app()

    shortage = probe.get("/shortage")
    assert shortage.status_code == 409
    err = _error(shortage)
    assert err["code"] == "INVENTORY_SHORTAGE"
    assert err["details"][0]["reason"] == "exceeds_remaining"

    paid = probe.get("/already-paid")
    assert paid.status_code == 409
    # code를 지정하지 않으면 상태코드 기본값이 붙는다
    assert _error(paid)["code"] == "INVALID_STATE"


def test_unhandled_exception_hides_internals():
    probe = FastAPI()
    register_exception_handlers(probe)

    @probe.get("/boom")
    def _boom():
        raise RuntimeError("DB 비밀번호가 틀렸습니다 secret=hunter2")

    res = TestClient(probe, raise_server_exceptions=False).get("/boom")
    assert res.status_code == 500
    err = _error(res)
    assert err["code"] == "INTERNAL_ERROR"
    assert "hunter2" not in err["message"], "내부 예외 내용이 노출되면 안 된다"
