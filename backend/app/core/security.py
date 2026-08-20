import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser:
    def __init__(self, id: str, email: str | None, claims: dict):
        self.id = id
        self.email = email
        self.claims = claims


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    """Supabase Auth access token(Authorization: Bearer <token>) 검증.

    AUTH_DISABLED=true면 검증을 건너뛰고 고정 개발용 사용자를 반환한다.
    로그인 미구현 MVP의 개발·시연 환경 전용이며 기본값은 false다.
    """
    settings = get_settings()

    if settings.auth_disabled:
        return CurrentUser(id="dev-staff", email=None, claims={"sub": "dev-staff"})

    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            "Missing bearer token")

    try:
        claims = jwt.decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            "Invalid or expired token") from exc

    return CurrentUser(id=claims["sub"], email=claims.get("email"), claims=claims)
