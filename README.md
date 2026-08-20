# 스냅빵 (SnapBbang) / 브레드아이 (BreadEye)

CJ푸드빌 뚜레쥬르 — 'Vision AI 기반 빵 인식·계산·재고 운영 최적화 시스템' 보일러플레이트.
(학습/제안용 프로젝트 시나리오이며 실제 CJ푸드빌 운영 서비스가 아닙니다. Notion "뚜레쥬르
요구사항 명세서 v1.0", "스냅빵_DB설계서_v1.2" 참고.)

> Docker를 처음 다루거나 환경을 처음 세팅하는 팀원은 이 문서 대신
> [DOCKER_GUIDE.md](./DOCKER_GUIDE.md)를 먼저 순서대로 따라 하세요. 이 README는 개발자용
> 레퍼런스입니다.

## 기술 스택

| 영역          | 기술                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| 리버스 프록시 | Nginx                                                                                    |
| 프론트엔드    | Next.js (React, JSX) + TailwindCSS + Zustand (상태관리)                                  |
| 백엔드        | Python FastAPI, JWT 인증, RESTful API (`/api/*`), Swagger UI(`/api/docs`)                |
| DB            | Supabase (PostgreSQL, 클라우드 매니지드) — 스냅빵 DB설계서 v1.2, 16개 테이블              |
| 파일 저장소   | Supabase Storage (트레이/상품 이미지, API key 사용)                                      |
| 인증          | Supabase Auth (JWT 발급 → 백엔드가 `SUPABASE_JWT_SECRET`으로 검증)                       |
| 모니터링/로깅 | structlog 구조화(JSON) 로깅(팀 컨벤션) + Prometheus 메트릭(`/metrics`)                   |
| CI/CD         | GitHub Actions (`.github/workflows/backend-ci.yml`) - lint/test/docker build             |
| 배포          | Docker Compose (Nginx + Next.js + FastAPI 컨테이너화, Supabase는 클라우드 매니지드 사용) |
| GPU 인스턴스  | 별도 GPU 컨테이너(`backend/Dockerfile.gpu` + `docker-compose.gpu.yml`)로 학습/추론 분리  |

Supabase는 클라우드에 이미 생성된 프로젝트에 연결하는 방식입니다 (로컬 Supabase 컨테이너 없음).

## 요청 흐름

```
브라우저 → Nginx(:80 → 301 리다이렉트, :443 HTTPS) ┬─ "/"       → frontend (Next.js, :3000)
                                                    └─ "/api/*" → backend  (FastAPI, :8000, /api 하위 라우트만)
```

프론트엔드는 Supabase Auth로 직접 로그인하고, 이후 백엔드를 호출할 때는 발급받은 access token을
`Authorization: Bearer <token>` 헤더로 실어 보냅니다. 백엔드는 `SUPABASE_JWT_SECRET`으로 토큰을
검증합니다(`app/core/security.py`). DB/Storage 접근은 백엔드가 `service_role` 키로 수행합니다.

공개 REST API는 전부 `/api` 아래 있습니다(nginx가 `/api/*`만 backend로 프록시하기 때문). Swagger
문서도 같은 이유로 `/api/docs`에서 서빙합니다(nginx 경유 시 `https://localhost/api/docs`로 접근
가능해야 하므로 - 루트 `/docs`에 두면 nginx 경유 시 404가 납니다).
`/health`, `/metrics`만 `/api` 밖에 있는 인프라 전용 엔드포인트로, nginx를 거치지 않고 Docker
내부망 또는 직접 포트(`:8000`)로만 접근합니다.

### 서비스 흐름 (Notion 요구사항 명세서 4장)

```
① 트레이 촬영 → ② AI 인식(탐지·분류·신뢰도) → ③ 인식 결과 표시 → ④ 고객 확인/직원 수정
  → ⑤ 금액 확정(멤버십 등급 할인·CJ ONE) → ⑥ 결제 → ⑦ 판매 반영·재고 갱신
  → ⑧ 재고 대시보드·매진임박 알림 → ⑨ 직원의 최종 판단
```

이 흐름은 `SCAN_SESSION → DETECTED_ITEM → CORRECTION_LOG → ORDERS/ORDER_ITEM →
INVENTORY → NOTIFICATION` 순서로 DB 테이블에 대응합니다(전체 16개 테이블, 6개 도메인 —
자세한 컬럼 명세는 Notion "스냅빵_DB설계서_v1.2" 참고).

## 사전 준비

1. [supabase.com](https://supabase.com)에서 프로젝트를 하나 생성합니다. ( 팀장이 공용으로 준비)
2. Project Settings → API에서 다음 값을 확인합니다: Project URL, `anon` public key, `service_role` key, JWT Secret.
3. Storage에서 이미지 업로드용 버킷을 하나 만듭니다 (기본값: `images`).

## 로컬 실행 (Docker Compose)

```bash
cp backend/.env.example backend/.env          # Supabase 값 채우기
cp frontend/.env.local.example frontend/.env.local  # Supabase 값 채우기

docker compose up --build
```

- 앱: https://localhost (http://localhost은 자동으로 https로 리다이렉트됩니다)
- API: https://localhost/api/\* (nginx 경유) 또는 http://localhost:8000/api/\* (직접)
- API 문서(Swagger): http://localhost:8000/api/docs
- 메트릭(Prometheus): http://localhost:8000/metrics

## HTTPS (자체 서명 인증서)

nginx가 처음 뜰 때 `localhost`용 자체 서명(self-signed) TLS 인증서를 컨테이너 안에서 자동
생성합니다(`nginx/generate-cert.sh`, `docker-entrypoint.d`에 등록되어 있어 별도 실행 불필요).
`./nginx/certs`에 볼륨으로 마운트되어 `docker compose down` 후에도 유지되며, 이 폴더는
`.gitignore`에 포함되어 있어 팀원마다 각자의 로컬에서 독립적으로 생성됩니다(비공개 키를
저장소에 커밋하지 않음 — 자체 서명 인증서는 로컬호스트 전용이라 공유해도 보안상 의미가 없고,
각자 생성하는 편이 더 안전합니다).

**팀원 공유 시**: 이 저장소를 클론하고 `docker compose up --build`만 실행하면 각자의 PC에서
동일하게 `https://localhost`로 접속 가능합니다. 자체 서명 인증서라 브라우저가 "안전하지 않음"
경고를 보여주는데, 최초 1회 "고급 → 계속 진행"으로 넘어가면 됩니다. 경고 자체를 없애고 싶다면
[mkcert](https://github.com/FiloSottile/mkcert)로 로컬 신뢰 CA를 만들어 `nginx/certs/localhost.crt`
`.key`를 직접 교체하는 방법도 있습니다(선택 사항, 각 팀원이 mkcert 설치 필요 - 파일만 그 자리에
넣어두면 재생성 스크립트가 기존 파일을 감지하고 건너뜁니다).

인증서를 재발급하려면: `nginx/certs` 폴더의 `localhost.crt`/`localhost.key`를 지우고
`docker compose restart nginx`(또는 다시 `up`)하면 됩니다.

`docker-compose.override.yml`이 `docker-compose.yml`과 함께 자동으로 적용되어 로컬 소스 코드가
컨테이너에 볼륨으로 마운트되고, 개발 서버(`npm run dev`, `uvicorn --reload`)로 실행됩니다 —
코드를 수정하면 컨테이너 재빌드 없이 바로 반영됩니다. 프로덕션 빌드/실행 방식 그대로 띄우려면
override를 빼고 실행하세요:

```bash
docker compose -f docker-compose.yml up --build
```

## 로컬 실행 (Docker 없이)

백엔드:

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate   # macOS/Linux는 source .venv/bin/activate
pip install -r requirements-dev.txt   # requirements.txt + pytest/httpx/ruff (테스트/린트용)
uvicorn app.main:app --reload   # http://localhost:8000

pytest        # 테스트
ruff check .  # 린트
```

프론트엔드:

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

Docker 없이 각각 띄울 경우 `frontend/.env.local`의 `NEXT_PUBLIC_API_URL`을
`http://localhost:8000`으로 바꿔주세요 (nginx를 거치지 않으므로).

## 디렉터리 구조

```
.
├── docker-compose.yml
├── docker-compose.override.yml  # 로컬 개발용: 소스 볼륨 마운트 + 핫리로드 (자동 적용)
├── docker-compose.gpu.yml       # GPU 인스턴스용 오버레이 (opt-in, 학습/추론)
├── .github/workflows/
│   └── backend-ci.yml       # lint(ruff) + test(pytest) + docker build
├── nginx/
│   └── nginx.conf           # "/api/*" → backend, 나머지 → frontend
├── backend/                 # FastAPI
│   ├── Dockerfile           # 프로덕션 API 이미지 (HEALTHCHECK 포함)
│   ├── Dockerfile.gpu       # GPU 학습/추론 전용 이미지 (nvidia/cuda 베이스)
│   ├── requirements.txt     # API 서버 런타임 의존성
│   ├── requirements-dev.txt # + pytest, httpx, ruff (로컬/CI 전용)
│   ├── requirements-gpu.txt # + torch, torchvision, opencv 등 (GPU 인스턴스 전용)
│   ├── pyproject.toml       # pytest/ruff 설정
│   ├── tests/                # test_health, test_me(JWT), test_products, test_scan_sessions,
│   │                          # test_schemas(16개 테이블 스키마 스모크 테스트)
│   └── app/
│       ├── main.py          # 앱 초기화, CORS, structlog 요청 로깅, 라우터/메트릭 마운트
│       ├── core/             # 설정(config), Supabase 클라이언트, JWT 검증(security), 로깅(structlog)
│       ├── schemas/          # 스냅빵 DB설계서 v1.2의 16개 테이블을 옮긴 pydantic 모델
│       │                     # (codes: 코드값, common/scan/orders/inventory/notifications/system: 도메인별)
│       └── api/
│           ├── router.py     # 공개 API를 "/api" prefix로 묶음
│           └── routes/       # health(인프라), me(인증 예시), storage(이미지 업로드),
│                              # products(상품 마스터, FR-16), scan_sessions(스캔+AI 인식 연동 지점, FR-01/02),
│                              # inventory(재고 대시보드, FR-13), notifications(매진임박 알림, FR-15)
└── frontend/                 # Next.js(JSX) + Tailwind + Zustand
    └── src/
        ├── app/             # App Router 페이지 (/, /login, /dashboard)
        ├── components/      # supabase-auth-listener.jsx (zustand 스토어 동기화)
        ├── store/           # useAuthStore.js (zustand)
        ├── lib/supabase/    # 브라우저/서버 Supabase 클라이언트
        ├── lib/api.js       # 백엔드 호출 헬퍼(토큰 자동 첨부)
        └── middleware.js    # 세션 갱신 + /dashboard 보호
```

## 현재 범위

이 저장소는 뼈대(보일러플레이트) + 스냅빵 DB설계서 v1.2를 반영한 기본 라우트를 포함합니다:
Nginx 리버스 프록시, 로그인/대시보드 예시 페이지, Supabase Auth 토큰을 검증하는 인증 라우트
(`/api/me`), 이미지 업로드 라우트(`/api/storage/upload`, 스캔/상품 이미지용), 상품 마스터
조회·등록(`/api/products`, FR-16), 트레이 스캔 세션 생성(`/api/scan-sessions`, FR-01), 재고
대시보드 조회(`/api/inventory`, FR-13), 매진임박 알림 조회·읽음처리(`/api/notifications`,
FR-15), `backend/app/schemas/`에 16개 테이블 전체를 옮긴 pydantic 모델, structlog 로깅/Prometheus
모니터링/CI 배선.

AI 인식(`/api/scan-sessions/{id}/recognize`)은 실제 GPU 추론 서버가 없어 501을 반환하는
자리표시자(stub)입니다 - 연결되면 `detected_item` 테이블에 결과를 적재하고 `scan_session.status`를
전이시켜야 합니다.

**아직 팀이 확정해야 할 것들** (코드로 임의 결정하지 않고 남겨둠):
- **STAFF_ACCOUNT ↔ Supabase Auth 연결**: `STAFF_ACCOUNT.staff_id`는 BIGINT, Supabase Auth
  사용자 ID는 UUID로 타입이 다릅니다. 둘을 연결하는 매핑(예: `STAFF_ACCOUNT`에 `auth_user_id
  UUID` 컬럼 추가)이 아직 없어서, `products`/`scan-sessions` 라우트는 `store_id`/`staff_id`를
  요청 바디로 직접 받습니다(JWT에서 자동으로 채우지 않음).
- **멤버십 등급 할인/적립률**: `MEMBERSHIP_GRADE`의 수치(할인율/적립률)는 전부 예시 가데이터이며
  실제 기획 확정 전입니다(DB설계서 7장 데이터 한계 고지).
- **주문(ORDERS) 생성 로직**: 스캔→정정→결제→재고차감→알림생성으로 이어지는 트랜잭션 로직은
  아직 API 스펙이 없어(2026-08-20 기준 API 명세서 미작성) 구현하지 않았습니다.

차량(vehicles), 파손이력(damage_history) 등은 이전 프로젝트 주제의 잔재이며 이번 세팅에서
전부 제거했습니다. GPU 인스턴스 배포(`docker-compose.gpu.yml`)와 CI/CD의 배포(deploy) 단계
(이미지 push, 실서버 반영)는 팀의 실제 레지스트리/서버 정보가 정해진 뒤 채워야 합니다.
