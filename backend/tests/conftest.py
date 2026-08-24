import os

# app.core.config.Settings는 .env를 읽지만, 테스트/CI 환경에는 .env가 없다.
# app을 import하기 전에 필수 값의 더미를 채워 넣는다.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret")
# 앱은 AUTH_DISABLED=true로 돌지만(.env), JWT 배선 자체는 계속 검증한다.
os.environ.setdefault("AUTH_DISABLED", "false")
