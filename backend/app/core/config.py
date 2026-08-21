from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    supabase_storage_bucket: str = "images"

    frontend_origin: str = "http://localhost"

    environment: str = "development"
    log_level: str = "INFO"

    # 로그인 화면(S-00) 미구현 MVP용. true면 JWT 검증을 건너뛰고 고정 직원으로 처리한다.
    auth_disabled: bool = False

    # AUTH_DISABLED=true 일 때 서버가 사용하는 시드 고정값 (DB 설계서 v1.4 · 7장)
    dev_store_id: int = 1
    dev_staff_id: int = 1
    dev_staff_name: str = "개발용 직원"
    dev_staff_role: str = "MANAGER"
    dev_store_name: str = "뚜레쥬르 스냅빵 데모매장"


@lru_cache
def get_settings() -> Settings:
    return Settings()
