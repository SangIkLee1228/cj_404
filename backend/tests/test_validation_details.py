"""422 응답의 details 규약 (API명세서 1.4 · 9장).

필드 단위 검증과 모델 단위 검증(@model_validator)은 FE가 다르게 처리해야 한다.
전자는 그 칸을 빨갛게 칠하면 되지만, 후자는 가리킬 칸이 없다.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, model_validator

from app.core.errors import ROOT_FIELD, register_exception_handlers


class _Payload(BaseModel):
    amount: int = Field(ge=0)
    reason: str | None = None

    @model_validator(mode="after")
    def _reason_required_when_discounting(self):
        if self.amount > 0 and not (self.reason or "").strip():
            raise ValueError("할인 금액이 있으면 사유를 입력해야 합니다")
        return self


def _client() -> TestClient:
    probe = FastAPI()
    register_exception_handlers(probe)

    @probe.post("/discount")
    def _discount(payload: _Payload):  # noqa: ARG001
        return {}

    return TestClient(probe, raise_server_exceptions=False)


def _details(response) -> list[dict]:
    assert response.status_code == 422
    return response.json()["error"]["details"]


def test_field_error_names_the_field():
    """loc의 'body'는 걸러내고 FE가 아는 이름만 남긴다."""
    detail = _details(_client().post("/discount", json={"amount": -1}))[0]
    assert detail["field"] == "amount"
    assert detail["reason"]


def test_model_level_error_uses_root_field():
    """모델 전체 검증은 __root__로 표시한다. 'body'라고 하면 필드명처럼 보인다."""
    detail = _details(_client().post("/discount", json={"amount": 500}))[0]
    assert detail["field"] == ROOT_FIELD


def test_model_level_error_carries_korean_message():
    """검증기에 쓴 한국어 문장이 그대로 전달돼야 FE가 보여줄 수 있다."""
    detail = _details(_client().post("/discount", json={"amount": 500}))[0]
    assert detail["message"] == "할인 금액이 있으면 사유를 입력해야 합니다"
    assert not detail["message"].startswith("Value error")
