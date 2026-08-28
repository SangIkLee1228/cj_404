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

    # ── AI 추론 서버 (팀원 Mac + ngrok 터널) ──────────────────────────────
    # 비어 있으면 recognize는 기존처럼 501을 준다. 값이 있어야 실제 추론을 건다.
    model_api_url: str = ""
    model_api_timeout: float = 30.0   # 명세서 4.4 "서버 타임아웃 30초"

    # 이 값 미만이면 is_below_threshold / needs_review = true. 0~100 스케일이다
    # (모델은 0~1로 주므로 recognition.py가 100을 곱한 뒤 비교한다).
    ai_confidence_threshold: float = 70.0

    # 시연용: 카메라 없이 "촬영"했을 때(image_url이 NULL) 대신 추론할 이미지가 담긴
    # 버킷. 버킷을 따로 두는 이유는 테스트 이미지가 supabase_storage_bucket이 아닌
    # 별도 버킷에 올라가 있기 때문이다.
    #
    # 파일 목록은 설정으로 받지 않고 호출 때마다 이 버킷 **루트**를 조회한다
    # (recognition.py::_demo_image_paths). Storage에 사진을 올리거나 지우면 그대로
    # 반영되므로, 장수가 바뀔 때마다 .env를 고치고 컨테이너를 다시 만들 필요가 없다.
    # 비워두면 이미지 없는 세션은 failure_reason="NO_IMAGE"로 실패한다.
    demo_scan_image_bucket: str = ""

    # AUTH_DISABLED=true 일 때 서버가 사용하는 시드 고정값 (DB 설계서 v1.4 · 7장)
    dev_store_id: int = 1
    dev_staff_id: int = 1
    dev_staff_name: str = "개발용 직원"
    dev_staff_role: str = "MANAGER"
    dev_store_name: str = "뚜레쥬르 스냅빵 데모매장"


@lru_cache
def get_settings() -> Settings:
    return Settings()
