# 백엔드 기본 세팅 요약 (v2 — 스냅빵/BreadEye 기준 재세팅)

**이전 세팅은 이 저장소에 남아있던 이전 프로젝트("차량 손상 검수") 흔적을 그대로 반영한
것이었습니다.** Notion의 "뚜레쥬르 요구사항 명세서 v1.0"과 "스냅빵_DB설계서_v1.2"(16개
테이블, 6개 도메인)를 전체 정독하고, 실제 프로젝트 주제(CJ푸드빌 뚜레쥬르 — Vision AI 기반
빵 인식·계산·재고 운영 최적화 시스템, 가칭 스냅빵/브레드아이)에 맞춰 백엔드를 다시 세팅했습니다.
차량(vehicles)/파손이력(damage_history) 관련 코드는 전부 제거했습니다.

## 이번에 새로 반영한 것

| 스택               | 반영 내용                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| DB 스키마          | `backend/app/schemas/`에 16개 테이블 전체를 pydantic 모델로 옮김 (코드값은 Literal 타입으로 강제)             |
| RESTful API        | 실제 도메인 라우트 4종: `products`(FR-16), `scan-sessions`(FR-01/02), `inventory`(FR-13), `notifications`(FR-15) |
| Swagger UI          | `/docs` → **`/api/docs`로 이동** (팀 Docker/Nginx 가이드 확인: nginx가 `/api/*`만 프록시하므로 루트 `/docs`는 nginx 경유 시 404) |
| 로깅                | `python-json-logger` → **structlog로 교체** (팀 Notion "StructLog" 페이지 컨벤션: `_common`/`_context`/이벤트 로그 3단 구조, `{도메인}.{동작}` 이벤트명, trace_id 전파) |
| GPU 추론 연동 지점 | `/api/inference/predict`(범용) → **`/api/scan-sessions/{id}/recognize`로 재설계** (SCAN_SESSION/DETECTED_ITEM 흐름에 맞춤, 여전히 501 stub) |

## 제거된 것

- `backend/app/api/routes/items.py`, `inference.py` (이전 프로젝트용 범용 예시) → `products.py`, `scan_sessions.py`로 대체
- `backend/app/models/`(빈 디렉터리) → `backend/app/schemas/`로 대체
- README/CI/nginx 주석 등에 남아있던 "차량", "damage", "cj-x-vision-backend" 등의 문구

## 새 파일

```
backend/app/schemas/
  codes.py           # 코드값 Literal 타입 (STAFF_ACCOUNT.role, ORDERS.status 등 6장 코드표 전체)
  common.py          # Store, StaffAccount, Member, MembershipGrade, Product(+Create)
  scan.py            # ScanSession(+Create), DetectedItem, CorrectionLog
  orders.py          # Order, OrderItem, PointTransaction
  inventory.py       # Inventory
  notifications.py   # Notification, SalesStatDaily, DemographicStat
  system.py          # ModelVersion

backend/app/api/routes/
  products.py        # GET/POST /api/products (FR-16, PRODUCT 테이블)
  scan_sessions.py    # POST /api/scan-sessions, POST /api/scan-sessions/{id}/recognize (stub)
  inventory.py        # GET /api/inventory (FR-13)
  notifications.py    # GET /api/notifications, PATCH /api/notifications/{id}/read (FR-15)

backend/tests/
  test_products.py, test_scan_sessions.py   # 401 인증 검증
  test_schemas.py                            # 16개 테이블 스키마 스모크 테스트
```

## 수정된 파일

```
backend/app/main.py         # 앱 title/description을 스냅빵으로, docs_url을 /api/docs로, structlog 미들웨어
backend/app/api/router.py   # products/scan_sessions/inventory/notifications 라우터 등록
backend/app/core/logging.py # structlog 설정 (팀 컨벤션 반영)
backend/app/api/routes/storage.py  # 예시 문구를 damage-history → scan_session/product 이미지로 수정
backend/requirements.txt    # python-json-logger → structlog
.github/workflows/backend-ci.yml   # 이미지 태그 cj-x-vision-backend → snapbbang-backend
nginx/nginx.conf, docker-compose.yml  # 주석 문구 수정 (damage-photo → tray-scan photo, /docs → /api/docs)
README.md                   # 제목/설명/기술스택/디렉터리구조/현재범위 전면 갱신
```

## 검증

로컬 venv에 `requirements-dev.txt`를 새로 설치해 처음부터 다시 확인했습니다.

- `ruff check .` → 통과
- `pytest` → **10 passed** (health, `/api/me` 401×2, products 401×2, scan-sessions 401×2, 16개 테이블 스키마 인스턴스화 3건)
- 서버 기동 후 확인: `/health` 200, **`/api/docs` 200 / 루트 `/docs` 404**(의도된 이동), `/api/products` 401(무토큰), `/metrics` 200
- `/api/openapi.json` 경로 목록이 `/api/products`, `/api/scan-sessions`, `/api/scan-sessions/{id}/recognize`, `/api/inventory`, `/api/notifications*`, `/api/me`, `/api/storage/*`, `/health`로 정확히 잡힘
- structlog 출력 실제 확인: `{"event": "http.request_completed", "trace_id": "...", "service": "snapbbang-backend", "env": "development", "timestamp": "...Z", ...}` — 팀 컨벤션의 `_common` 자동 주입 필드 정상 동작

## 팀이 확정해야 할 것 (코드로 임의 결정하지 않음)

1. **STAFF_ACCOUNT(BIGINT) ↔ Supabase Auth 사용자(UUID) 매핑이 아직 없습니다.** 그래서
   `products`/`scan-sessions` 생성 라우트는 `store_id`/`staff_id`를 JWT에서 유도하지 않고
   요청 바디로 직접 받습니다. 매핑 컬럼(예: `STAFF_ACCOUNT.auth_user_id UUID`)이 정해지면
   `get_current_user`를 확장해 자동으로 채우도록 바꿔야 합니다.
2. **`ORDERS.membership_discount_amount`의 DB설계서 "기본값" 칸(`total_amount*0.5`)이 본문
   설명(등급별 `discount_rate`로 계산)과 모순됩니다** — DB설계서 팀에 확인 필요 (오탈자로 추정).
3. **API 명세서가 아직 없습니다** (2026-08-20 기준, 팀 스프린트 백로그의 8/21 예정 작업). 주문
   생성(결제→재고차감→알림생성) 같은 트랜잭션 로직은 API 스펙이 나온 뒤 구현하는 게 맞다고
   판단해 이번 세팅에는 포함하지 않았습니다.
4. **CJ ONE 포인트 적립률**이 요구사항 명세서(0.5%/제휴시 0.1%)와 목업 설명서(0.1% 고정) 간에
   불일치합니다 — `MEMBERSHIP_GRADE`로 스키마는 대비돼 있으나 실제 수치는 기획 확정 필요.
5. **보안**: Notion 스프린트 백로그 페이지에 Supabase `service_role` 키와 JWT secret이 평문으로
   박혀 있습니다. `backend/.env`의 키와 동일하다면(확인 결과 동일함) **키 재발급 + Notion에서
   평문 삭제를 권장**합니다 — 코드로 해결할 문제가 아니라 팀 조치가 필요합니다.

## 실행 방법 (변경 없음)

```bash
docker compose up --build          # 로컬 개발 (핫리로드)
cd backend && pip install -r requirements-dev.txt && uvicorn app.main:app --reload
pytest && ruff check .
```
