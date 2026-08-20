from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

environment: str = "development"
log_level: str = "INFO"

# 로그인 화면(S-00) 미구현 MVP용. true면 JWT 검증을 건너뛴다.
auth_disabled: bool = False


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    supabase_storage_bucket: str = "images"

    frontend_origin: str = "http://localhost"

    environment: str = "development"
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
