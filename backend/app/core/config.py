from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    supabase_storage_bucket: str = "images"

    # PRODUCT.image_url에는 Storage 공개 URL이 그대로 저장돼 있다. 버킷을 private으로
    # 바꾸면 그 URL이 403이 되므로, 그때 이 값을 true로 켜면 응답이 서명 URL로 나간다.
    # 기본값 false = 지금 동작 그대로 (app/core/images.py 참고).
    sign_image_urls: bool = False

    frontend_origin: str = "http://localhost"

    environment: str = "development"
    log_level: str = "INFO"

    # 로그인 화면(S-00) 미구현 MVP용. true면 JWT 검증을 건너뛰고 고정 직원으로 처리한다.
    auth_disabled: bool = False

    # 시연용 결제 실패(402) 경로. auth_disabled에 얹지 않고 따로 둔 이유:
    # .env.example이 AUTH_DISABLED=true를 싣고 있어서, 그걸 복사한 배포에 결제를
    # 거절시키는 헤더까지 딸려 들어간다. 스위치 하나가 두 가지를 켜면 안 된다.
    mock_payment_failure: bool = False

    # AUTH_DISABLED=true 일 때 서버가 사용하는 시드 고정값 (DB 설계서 v1.4 · 7장)
    dev_store_id: int = 1
    dev_staff_id: int = 1
    dev_staff_name: str = "개발용 직원"
    dev_staff_role: str = "MANAGER"
    dev_store_name: str = "뚜레쥬르 스냅빵 데모매장"


@lru_cache
def get_settings() -> Settings:
    return Settings()
