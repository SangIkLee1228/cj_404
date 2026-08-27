"""표준 에러 응답 (API명세서 v1.2 · 1.4).

모든 오류를 아래 한 가지 모양으로 통일한다:

    { "error": { "code": "...", "message": "...", "details": [...], "trace_id": "..." } }

왜 code가 필요한가:
    같은 409라도 "재고 부족(INVENTORY_SHORTAGE)"과 "이미 결제된 주문(INVALID_STATE)"은
    프론트가 완전히 다르게 처리해야 한다. 전자는 부족 상품을 보여주고 수량을 줄이게 하고,
    후자는 주문 상태를 다시 조회해야 한다. HTTP 상태코드만으로는 구분이 안 된다.

message는 직원에게 그대로 보여줄 한국어 한 문장으로 쓴다.
"""

from typing import Any

import structlog
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = structlog.get_logger("app.error")

# 모델 전체를 대상으로 한 검증(@model_validator)은 가리킬 입력 칸이 없다.
# 그동안은 이런 오류의 field가 "body"로 나갔는데, FE 입장에서는 body라는 이름의
# 필드가 있는 것처럼 보여 어느 칸을 빨갛게 칠할지 알 수 없었다.
# "어느 칸도 아니다"를 뜻하는 예약어를 쓴다 (API명세서 1.4).
ROOT_FIELD = "__root__"

# pydantic이 우리 ValueError를 감쌀 때 앞에 붙이는 문구.
# 검증기에 한국어 메시지를 써 뒀으므로 접두사만 떼면 그대로 화면에 쓸 수 있다.
_VALUE_ERROR_PREFIX = "Value error, "


def _detail_of(err: dict[str, Any]) -> dict[str, str]:
    """pydantic 오류 1건을 명세서 1.4의 details 항목으로 옮긴다.

    loc에서 "body"를 걸러내는 이유: 요청 바디의 필드는 ("body", "amount") 처럼
    오는데 FE가 아는 이름은 "amount"뿐이다. 걸러내고 나서 남는 게 없으면
    모델 단위 검증이라는 뜻이다.
    """
    location = [str(part) for part in err.get("loc", []) if part != "body"]

    message = str(err.get("msg", "") or "")
    if message.startswith(_VALUE_ERROR_PREFIX):
        message = message[len(_VALUE_ERROR_PREFIX):]

    detail: dict[str, str] = {
        "field": ".".join(location) if location else ROOT_FIELD,
        "reason": str(err.get("type", "invalid")),
    }
    if message:
        detail["message"] = message
    return detail

# HTTP 상태코드 -> 기본 에러코드 (명세서 1.4 표)
DEFAULT_CODE: dict[int, str] = {
    400: "INVALID_REQUEST",
    401: "UNAUTHORIZED",
    402: "PAYMENT_FAILED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "INVALID_STATE",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "VALIDATION_ERROR",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_ERROR",
    501: "NOT_IMPLEMENTED",
}


class ApiError(HTTPException):
    """에러코드를 직접 지정해야 할 때 쓴다.

    같은 상태코드에 여러 의미가 있는 경우에만 필요하다.
        raise ApiError(409, "INVENTORY_SHORTAGE", "소금빵의 잔여 수량이 부족합니다 (요청 5, 잔여 2)",
                       details=[{"field": "items[0].quantity", "reason": "exceeds_remaining"}])

    의미가 하나뿐이면 그냥 HTTPException을 써도 된다 - 위 표에서 코드가 자동으로 붙는다.
    """

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[dict[str, Any]] | None = None,
    ):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.details = details


def _trace_id(request: Request) -> str | None:
    return getattr(request.state, "trace_id", None) or request.headers.get("x-request-id")


def _body(
    code: str, message: str, trace_id: str | None, details: list[dict[str, Any]] | None = None
) -> dict:
    error: dict[str, Any] = {"code": code, "message": message}
    if details:
        error["details"] = details
    if trace_id:
        error["trace_id"] = trace_id
    return {"error": error}


def register_exception_handlers(app: FastAPI) -> None:
    """앱에 핸들러 3개를 등록한다. main.py에서 한 번 호출하면 끝."""

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        # pydantic 검증 실패를 명세서의 details 모양으로 옮긴다.
        details = [_detail_of(err) for err in exc.errors()]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_body(
                "VALIDATION_ERROR", "입력값을 다시 확인해 주세요.", _trace_id(
                    request), details
            ),
        )

    @app.exception_handler(HTTPException)
    async def _http_error(request: Request, exc: HTTPException):
        code = getattr(exc, "code", None) or DEFAULT_CODE.get(
            exc.status_code, "INVALID_REQUEST")
        message = exc.detail if isinstance(
            exc.detail, str) else "요청을 처리할 수 없습니다."
        return JSONResponse(
            status_code=exc.status_code,
            content=_body(code, message, _trace_id(request),
                          getattr(exc, "details", None)),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def _unhandled_error(request: Request, exc: Exception):
        # 내부 예외 내용은 로그에만 남기고 클라이언트에는 노출하지 않는다.
        logger.exception("http.unhandled_error", path=request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_body(
                "INTERNAL_ERROR", "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
                _trace_id(request),
            ),
        )
