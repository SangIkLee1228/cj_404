# 스냅빵 (SnapBbang)

CJ푸드빌 뚜레쥬르 — 'Vision AI 기반 빵 인식·계산·재고 운영 최적화 시스템' 보일러플레이트.
현재는 Next.js + FastAPI + Supabase 보일러플레이트 단계입니다.
(학습/제안용 프로젝트 시나리오이며 실제 CJ푸드빌 운영 서비스가 아닙니다. Notion "뚜레쥬르
요구사항 명세서 v1.0", "스냅빵_DB설계서_v1.4" 참고.)

> Docker를 처음 다루거나 환경을 처음 세팅하는 팀원은 이 문서 대신
> [DOCKER_GUIDE.md](./DOCKER_GUIDE.md)를 먼저 순서대로 따라 하세요. 이 README는 개발자용
> 레퍼런스입니다.

> ⚠️ **학습/제안용 프로젝트입니다.** 실제 CJ푸드빌 운영 서비스가 아니며, 설계서에 등장하는
> CJ ONE 연동·POS/PG 결제·멤버십 등급 정책 등은 전부 가데이터/Mock 기준입니다. 자세한 전제와
> 한계는 아래 [참고 문서](#참고-문서)와 각 문서의 "데이터 한계 고지" 절을 확인하세요.

## 프로젝트 개요

- **문제**: 매장 직원이 빵 종류·가격을 육안으로 식별해 POS에 입력하면서 계산 병목과 오류가
  발생하고, 판매 데이터가 재고·생산 계획으로 이어지지 않습니다.
- **해결**: 계산대 카메라로 트레이를 촬영해 Vision AI가 품목·수량을 인식하고, 직원이 결과를
  확인/정정한 뒤 결제로 확정합니다. 이 결제 시점 데이터가 재고 차감, 매진 임박 알림, 판매
  통계의 원천이 됩니다.
- **핵심 사용자**: 계산대 직원(주 사용자), 고객(CJ ONE 조회·적립만, 조작 없음), 점주/매니저
  (재고·통계·상품 마스터 관리).
- **범위**: 매장 계산대의 인식·계산·재고·알림 흐름이 중심이며, 품절 예측·생산 추천 같은
  AI/통계 모델링 기능과 본사 통합 대시보드는 이번 버전(PoC) 범위 밖입니다.

## 참고 문서

이 README는 아래 설계 문서를 근거로 작성되었습니다. 화면/테이블/기능 ID(FR-xx, S-xx 등)의
출처는 모두 이 문서들입니다.

| 문서                        | 내용                                                         |
| ---------------------------- | ------------------------------------------------------------ |
| 뚜레쥬르 요구사항 명세서 v1.0 | 기능/비기능 요구사항(FR-01~FR-23, NFR-01~NFR-07) 원본 정의   |
| 유저플로우                    | 화면 흐름 분류(Group 0~E), 상태 전이, 문서 분할(F-00~F-07)   |
| UX 시스템 문서 v2.0           | 화면 정의(S-00~S-13), 정보 구조, 데이터 계층, 신뢰도 UX 규칙 |
| 스냅빵_DB설계서 v1.2          | 6개 도메인 16개 테이블 ERD, 컬럼 명세, 공통 코드값, FR 매핑  |

## 핵심 기능

계산대(직원 조작) 기준 처리 흐름은 다음과 같습니다.

1. **스캔** — 직원이 트레이를 카메라에 올리고 촬영(FR-01), 겹침 발생 시 사전 경고(FR-03)
2. **인식 결과 확인/정정** — AI가 반환한 품목·수량·신뢰도를 확인하고, 삭제/수량변경(FR-04),
   신뢰도 낮은 항목 재선택(FR-05), 미탐 항목 직접 검색 추가(FR-06)로 정정
3. **결제** — 멤버십 등급 기반 자동 할인·직원 수동 할인 오버라이드(FR-07/08), 결제 처리(FR-09),
   장애 시 수동 입력 우회(FR-10)
4. **재고·알림** — 결제 완료 즉시 재고 차감(FR-12), 재고 대시보드(FR-13), 재고 기준선 대비
   잔여 수량이 낮아지면 매진 임박 알림 발생(FR-15, v1.2 개정)
5. **멤버십** — CJ ONE 등급별 할인율·포인트 적립률 적용, 포인트 거래 이력 기록(FR-18)
6. **운영/관리** — 상품(빵) 마스터 등록·수정(FR-16), 판매·정정률 통계 조회(FR-17)
7. **재학습 데이터 축적** — 모든 정정 이력은 삭제 없이 append-only로 보존되어(FR-20) 향후 AI
   재학습 데이터로 활용됩니다.

품절 예측·생산 추천(구 FR-14/15)은 v1.2에서 시간 제약으로 범위 밖으로 조정되었고, 대신 재고
기준선(`PRODUCT.stock_baseline_pct`) 대비 잔여 수량 비교라는 단순 규칙 기반 알림으로
대체되었습니다. 자세한 변경 이력은 DB 설계서 1.4절을 참고하세요.

## 화면 구성

UX 시스템 문서 기준 화면은 역할별로 3개 프로파일(POS/고객/운영)로 나뉩니다.

| 구분             | 화면                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| P. POS (직원)     | S-00 직원 로그인, S-01 스캔, S-02 인식 결과·수정, S-03 결제, S-04 결제 완료, S-13 보류 목록, M-01 잠금 오버레이 |
| C. 고객 (조작 없음, CJ ONE 입력만 예외) | S-10 계산 내역 실시간 확인, S-11 CJ ONE 적립·할인, S-12 진행 상태(대기/결제중/완료) |
| O. 운영·관리      | S-05 재고 대시보드, S-06 생산 추천 알림, S-07 상품 마스터 관리, S-08 판매 통계                |

## 데이터 모델

스냅빵_DB설계서 v1.2 기준 6개 도메인, 16개 테이블입니다. snake_case 명명, `BIGINT AUTO_INCREMENT`
대리키, 상태/구분값은 ENUM 대신 `VARCHAR` + 코드표 방식을 사용합니다.

| 도메인             | 테이블                                                            |
| ------------------- | ------------------------------------------------------------------ |
| A. 공통·마스터      | STORE, STAFF_ACCOUNT, MEMBER, MEMBERSHIP_GRADE, PRODUCT             |
| B. 인식·스캔        | SCAN_SESSION, DETECTED_ITEM, CORRECTION_LOG                         |
| C. 주문·결제·멤버십 | ORDERS, ORDER_ITEM, POINT_TRANSACTION                               |
| D. 재고             | INVENTORY                                                           |
| E. 알림·통계        | NOTIFICATION, SALES_STAT_DAILY, DEMOGRAPHIC_STAT                    |
| F. 시스템 관리      | MODEL_VERSION (AI 인식 모델 버전/배포 이력)                         |

전체 컬럼 명세, 인덱스, ERD, FR ↔ 테이블 매핑표는 DB 설계서 4~9장을 참고하세요. 이력 보존이
필요한 `CORRECTION_LOG`, `ORDER_ITEM.unit_price` 등은 UPDATE/DELETE 없이 append-only로
설계되어 있습니다.

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

설계서 기준 실제 직원 인증은 매장 계산대 앞에서 직원 목록 선택 + PIN/비밀번호 입력 방식(S-00,
사번 타이핑 없음)이며, Supabase Auth의 email/password 로그인은 이를 구현하기 전 단계의
보일러플레이트 예시입니다.

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

## 현재 범위 / 다음 단계

이 저장소는 뼈대(보일러플레이트) + 스냅빵 DB설계서 v1.2를 반영한 기본 라우트를 포함합니다:
Nginx 리버스 프록시, 로그인/대시보드 예시 페이지, Supabase Auth 토큰을 검증하는 인증 라우트
(`/api/me`), 이미지 업로드 라우트(`/api/storage/upload`, 스캔/상품 이미지용), 상품 마스터
조회·등록(`/api/products`, FR-16), 트레이 스캔 세션 생성(`/api/scan-sessions`, FR-01), 재고
대시보드 조회(`/api/inventory`, FR-13), 매진임박 알림 조회·읽음처리(`/api/notifications`,
FR-15), `backend/app/schemas/`에 16개 테이블 전체를 옮긴 pydantic 모델, structlog 로깅/Prometheus
모니터링/CI 배선. 화면 타이틀·API 타이틀·패키지명 등 표면적인 프로젝트명도 스냅빵 기준으로
정리되어 있습니다.

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

DB 설계서는 남은 테이블에 대한 MVP 우선순위를 아래처럼 제안합니다(2.3절 참고).

1. **1차(필수)**: `STORE`, `STAFF_ACCOUNT`, `PRODUCT`, `SCAN_SESSION`, `DETECTED_ITEM`,
   `ORDERS`, `ORDER_ITEM`, `INVENTORY`, `NOTIFICATION`
2. **2차(보조)**: `MEMBERSHIP_GRADE`, `CORRECTION_LOG`, `MEMBER`, `POINT_TRANSACTION`,
   `SALES_STAT_DAILY`
3. **3차(후속)**: `DEMOGRAPHIC_STAT`, `MODEL_VERSION`

화면 구현은 유저플로우 문서의 작업 순서(F-00 → F-01 → F-02 → F-03 → F-04 → F-05 → F-06 → F-07)를
따르는 것을 권장합니다. UX 시스템 문서 14장에는 착수 전 확정이 필요한 미해결 이슈(재고 스냅샷
기준값 부재, 결제 후 오류 처리 경로 부재 등)가 정리되어 있으니 구현 전에 함께 검토하세요.
