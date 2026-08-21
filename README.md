# 스냅빵 (SnapBbang)

CJ푸드빌 뚜레쥬르 — **Vision AI 기반 빵 인식·계산·재고 운영 최적화 시스템**

트레이 위 빵을 촬영해 자동 인식·계산하고, 그 결제 데이터를 재고 차감·매진 임박 알림·판매
통계로 이어 붙이는 매장 운영 도구입니다.

> ⚠️ **학습/제안용 프로젝트입니다.** 실제 CJ푸드빌 운영 서비스가 아니며 CJ ONE 연동·POS/PG
> 결제·멤버십 등급 정책은 전부 가데이터/Mock입니다.

> Docker나 환경 세팅이 처음이라면 [DOCKER_GUIDE.md](./DOCKER_GUIDE.md)를 먼저 따라 하세요.
> 이 README는 개발자용 레퍼런스입니다.

---

## 빠른 시작

```bash
cp backend/.env.example backend/.env                 # Supabase 값 채우기
cp frontend/.env.local.example frontend/.env.local   # Supabase 값 채우기

docker compose up --build
```

| 대상            | 주소                                                        |
| --------------- | ----------------------------------------------------------- |
| 앱              | https://localhost (http는 자동으로 https 리다이렉트)        |
| API             | https://localhost/api/\*                                    |
| Swagger         | https://localhost/api/docs                                  |
| 헬스체크·메트릭 | http://localhost:8000/health, http://localhost:8000/metrics |

`/health`와 `/metrics`는 `/api` **밖**에 있어 nginx를 거치지 않습니다. Docker healthcheck와
Prometheus가 내부망에서 직접 호출하는 용도라 브라우저의 `https://localhost/health`로는 열리지
않습니다.

`docker-compose.override.yml`이 자동 적용되어 소스가 볼륨 마운트되고 핫리로드로 뜹니다.
프로덕션 방식으로 띄우려면 `docker compose -f docker-compose.yml up --build`.

---

## 아키텍처

```
브라우저 ──HTTPS──▶ [Nginx :443] ┬─ "/"      ──▶ [Next.js :3000]
                                  └─ "/api/*" ──▶ [FastAPI :8000] ──▶ Supabase (클라우드)
```

Nginx가 TLS를 종료하고 내부망으로는 평문 HTTP로 넘깁니다. 공개 REST API는 전부 `/api` 아래에
있고, Swagger도 같은 이유로 `/api/docs`에서 서빙합니다(루트 `/docs`에 두면 nginx 경유 시 404).

**인증** — MVP는 로그인 화면을 구현하지 않습니다. `AUTH_DISABLED=true`면 백엔드가 시드 고정
직원(`store_id=1`, `staff_id=1`, role `MANAGER`)으로 처리하고 프론트는 토큰을 붙이지 않습니다.
확장 시 플래그를 끄면 Supabase Auth JWT 검증 경로(`app/core/security.py`)가 살아납니다.
DB·Storage 접근은 백엔드가 `service_role` 키로 수행합니다.

### 판매 1건 처리 흐름

```
① POST /orders                       주문 시작 (PENDING)
② POST /storage/images?purpose=SCAN  트레이 이미지 업로드
③ POST /scan-sessions                스캔 세션 생성 (BASIC | ADD | RETAKE)
④ POST /scan-sessions/{id}/recognize AI 인식 → 주문에 자동 반영
⑤ PATCH/DELETE/POST /orders/{id}/items  직원 정정
⑥ POST /orders/{id}/member           (선택) CJ ONE 연결
⑦ POST /orders/{id}/pay              결제 확정 → 재고 차감 + 매진임박 알림 + 포인트 적립
```

전체 규약은 **[docs/스냅빵\_API명세서\_v1.2.md](./docs/스냅빵_API명세서_v1.2.md)** 참고.

---

## 기술 스택

| 영역          | 기술                                                                |
| ------------- | ------------------------------------------------------------------- |
| 리버스 프록시 | Nginx (자체 서명 TLS 자동 생성)                                     |
| 프론트엔드    | Next.js 15 (App Router, JSX) + TailwindCSS                          |
| 백엔드        | FastAPI 0.115, RESTful `/api/*`, Swagger `/api/docs`                |
| DB            | Supabase (PostgreSQL, 클라우드 매니지드) — 16개 테이블              |
| 파일 저장소   | Supabase Storage (비공개 버킷 + 서명 URL)                           |
| 인증          | Supabase Auth JWT (MVP는 `AUTH_DISABLED=true`로 우회)               |
| 로깅·모니터링 | structlog JSON 로깅 + Prometheus `/metrics`                         |
| CI            | GitHub Actions — ruff lint + pytest + docker build                  |
| 배포          | Docker Compose (Nginx + Next.js + FastAPI)                          |
| GPU           | 별도 컨테이너 (`backend/Dockerfile.gpu` + `docker-compose.gpu.yml`) |

Supabase는 클라우드에 이미 생성된 프로젝트에 붙는 방식입니다(로컬 Supabase 컨테이너 없음).

---

## 화면 구성

UX 설계서 v3.0 기준 12개 화면, 3개 화면군.

| 화면군                                              | 화면                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **P. 계산 (직원, 태블릿 1280×800)**                 | S-01 촬영 · S-02 인식 결과·수정 · S-03 결제 · S-04 결제 완료 · S-05 금일 판매 현황 |
| **C. 고객 (세로 디스플레이, 조작은 CJ ONE 입력만)** | S-08 계산 목록·메뉴 추천 · S-09 CJ ONE 입력 · S-10 계산 진행 상태                  |
| **O. 운영 관리 (매니저, 웹 1440×900)**              | S-06 상품 마스터 · S-07 판매 통계 · S-11 재고 관리 · S-12 재고 알림                |

UI 용어는 **"촬영"** 으로 통일합니다("스캔"은 금지어). 재고는 추정치이므로 "재고 12개"가 아니라
**"추정 12개"** 로 표기하고, 자동 발주로 이어지지 않음을 화면에 명시합니다(NFR-07).

---

## 데이터 모델

DB 설계서 v1.4 기준 6개 도메인 16개 테이블. snake_case, `BIGINT` 대리키, 상태값은 ENUM 대신
`VARCHAR` + 코드표.

| 도메인         | 테이블                        | MVP |
| -------------- | ----------------------------- | --- |
| A. 공통·마스터 | STORE, STAFF_ACCOUNT, PRODUCT | 1차 |
|                | MEMBER, MEMBERSHIP_GRADE      | 2차 |
| B. 인식·스캔   | SCAN_SESSION, DETECTED_ITEM   | 1차 |
|                | CORRECTION_LOG                | 2차 |
| C. 주문·결제   | ORDERS, ORDER_ITEM            | 1차 |
|                | POINT_TRANSACTION             | 2차 |
| D. 재고        | INVENTORY                     | 1차 |
| E. 알림·통계   | NOTIFICATION                  | 1차 |
|                | SALES_STAT_DAILY              | 2차 |
|                | DEMOGRAPHIC_STAT              | 3차 |
| F. 시스템      | MODEL_VERSION                 | 3차 |

`backend/app/schemas/`에 16개 테이블 전체가 pydantic 모델로 옮겨져 있습니다. 전체 컬럼 명세와
ERD는 Notion "스냅빵\_DB설계서\_v1.4" 참고.

---

## 디렉터리 구조

```
.
├── docker-compose.yml
├── docker-compose.override.yml   # 로컬 개발용: 볼륨 마운트 + 핫리로드 (자동 적용)
├── docker-compose.gpu.yml        # GPU 인스턴스용 오버레이 (opt-in)
├── DOCKER_GUIDE.md               # 환경 세팅 입문 가이드
├── .github/workflows/
│   └── backend-ci.yml            # ruff lint + pytest + docker build
├── docs/
│   └── 스냅빵_API명세서_v1.2.md   # API 규약 (엔드포인트·에러·타임존·코드표)
├── nginx/
│   ├── nginx.conf                # "/api/*" → backend, 나머지 → frontend
│   ├── Dockerfile
│   └── generate-cert.sh          # 컨테이너 첫 기동 시 자체 서명 인증서 생성
├── backend/                      # FastAPI
│   ├── Dockerfile                # 프로덕션 API 이미지 (HEALTHCHECK 포함)
│   ├── Dockerfile.gpu            # GPU 학습/추론 이미지 (nvidia/cuda 베이스)
│   ├── requirements.txt          # 런타임 의존성
│   ├── requirements-dev.txt      # + pytest, httpx, ruff
│   ├── requirements-gpu.txt      # + torch, torchvision, opencv
│   ├── pyproject.toml            # pytest / ruff 설정
│   ├── tests/                    # health, me(JWT), products, scan_sessions, schemas
│   └── app/
│       ├── main.py               # 앱 초기화, CORS, 요청 로깅, 라우터·메트릭 마운트
│       ├── core/
│       │   ├── config.py         # Settings (.env), AUTH_DISABLED, 시드 고정 직원
│       │   ├── security.py       # Supabase JWT 검증 / AUTH_DISABLED 우회
│       │   ├── supabase_client.py
│       │   └── logging.py        # structlog JSON 로깅
│       ├── schemas/              # 16개 테이블 pydantic 모델
│       │   ├── codes.py          # 공통 코드값
│       │   └── common · scan · orders · inventory · notifications · system
│       └── api/
│           ├── router.py         # 공개 API를 "/api" prefix로 묶음
│           └── routes/
│               ├── health.py         # 인프라 전용 ("/api" 밖)
│               ├── me.py             # 현재 직원 정보
│               ├── storage.py        # 이미지 업로드 / 서명 URL
│               ├── products.py       # 상품 마스터 (FR-16)
│               ├── scan_sessions.py  # 스캔 + AI 인식 연동 지점 (FR-01/02)
│               ├── inventory.py      # 재고 (FR-13)
│               └── notifications.py  # 매진임박 알림 (FR-15)
└── frontend/                     # Next.js (JSX) + Tailwind
    └── src/
        ├── app/
        │   ├── layout.jsx
        │   ├── page.jsx              # 홈
        │   ├── globals.css
        │   └── dashboard/
        │       ├── page.jsx
        │       └── backend-status.jsx  # 백엔드 연결 확인 위젯
        └── lib/api.js                # 백엔드 호출 헬퍼
```

---

## Docker 없이 실행

```bash
# 백엔드
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv/Scripts/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload    # http://localhost:8000
pytest && ruff check .

# 프론트엔드
cd frontend
npm install
npm run dev                       # http://localhost:3000
```

nginx를 거치지 않으므로 `frontend/.env.local`의 `NEXT_PUBLIC_API_URL`을
`http://localhost:8000/api`로 바꿔주세요.

---

## HTTPS (자체 서명 인증서)

nginx 컨테이너가 처음 뜰 때 `localhost`용 자체 서명 인증서를 자동 생성합니다
(`nginx/generate-cert.sh`). `nginx/certs`에 볼륨으로 남아 `docker compose down` 후에도 유지되며,
`.gitignore`에 포함되어 팀원마다 각자 생성됩니다(비공개 키를 저장소에 커밋하지 않음).

브라우저가 "안전하지 않음" 경고를 띄우면 최초 1회 **고급 → 계속 진행**으로 넘어가면 됩니다.
경고까지 없애려면 [mkcert](https://github.com/FiloSottile/mkcert)로 만든 인증서를
`nginx/certs/localhost.crt`·`.key`에 넣어두세요(생성 스크립트가 기존 파일을 감지하고 건너뜁니다).

재발급: `nginx/certs`의 두 파일을 지우고 `docker compose restart nginx`.

---

## 구현 현황

**동작하는 것** — Nginx 리버스 프록시 + HTTPS, 홈·대시보드 페이지, `/api/me`, 이미지 업로드
(`/api/storage/upload`, `/api/storage/signed-url`), 상품 조회·등록(`/api/products`), 스캔 세션
생성(`/api/scan-sessions`), 재고 조회(`/api/inventory`), 알림 조회·읽음(`/api/notifications`),
16개 테이블 pydantic 모델, structlog 로깅 / Prometheus / CI 배선.

**막혀 있는 것**

| 항목                                | 상태                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Supabase 테이블 생성                | `CREATE TABLE` 미실행 — 지금 `/api/products`를 호출하면 테이블 부재 오류                |
| 주문·결제 도메인 (13개 엔드포인트)  | 미착수. **MVP 시연의 실질 병목**                                                        |
| `/api/scan-sessions/{id}/recognize` | GPU 추론 서버 미연결로 501 반환하는 stub                                                |
| 기존 라우트의 요청/응답 스키마      | API 명세서 v1.2와 불일치(요청 바디의 `store_id`/`staff_id`, `response_model` 미지정 등) |

상세한 차이와 정정 대상은 API 명세서 v1.2의 **2장 「구현」 열**과 **8장 부록 A**에 정리돼
있습니다.

**MVP 범위 밖** — 로그인 화면·직원 전환·화면 잠금, 세트/프로모션 할인, 반품·환불, 본사
대시보드, 품절 예측·생산 추천, 실제 POS/PG 연동.

---

## 참고 문서 (Notion)

| 문서                          | 내용                                                    |
| ----------------------------- | ------------------------------------------------------- |
| 뚜레쥬르 요구사항 명세서 v1.0 | FR-01~FR-23, NFR-01~NFR-07, 화면 목록                   |
| 스냅빵\_DB설계서 v1.4         | 16개 테이블 ERD·컬럼 명세·공통 코드표·FR 매핑           |
| 스냅빵\_API명세서 v1.2        | 엔드포인트·공통 규약 (`docs/`에도 사본)                 |
| UX 설계서 v3.0                | 화면 정의(S-01~S-12), 상태 전이, 오류 처리, 라이팅 규칙 |
| 유저 플로우 명세서            | 화면 흐름과 분기 원천                                   |
| StructLog                     | 로그 이벤트 규약                                        |
