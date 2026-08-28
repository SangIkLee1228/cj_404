# 스냅빵 (SnapBbang)

CJ 푸드빌 뚜레쥬르 — **Vision AI 기반 빵 인식·계산·재고 운영 최적화 시스템**

트레이 위 빵을 촬영해 자동 인식·계산하고, 그 결제 데이터를 재고 차감·매진 임박 알림·판매
통계로 이어 붙이는 매장 운영 도구입니다.

> **학습/제안용 프로젝트입니다.** 실제 CJ푸드빌 운영 서비스가 아니며 CJ ONE 연동·POS/PG
> 결제, 멤버십 등급 정책은 전부 가데이터 / Mock입니다.

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
| 직원 POS        | https://localhost/pos                                       |
| 운영 대시보드   | https://localhost/dashboard                                 |
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
① POST   /api/orders                          주문 시작 (PENDING)
② POST   /api/storage/images?purpose=SCAN     트레이 이미지 업로드
③ POST   /api/scan-sessions                   스캔 세션 생성 (BASIC | ADD | RETAKE)
④ POST   /api/scan-sessions/{id}/recognize    AI 인식 → 주문에 자동 반영
⑤ POST   /api/orders/{id}/items               직원 정정 (PATCH · DELETE 포함)
⑥ POST   /api/orders/{id}/member              (선택) CJ ONE 연결
⑦ POST   /api/orders/{id}/pay                 결제 확정 → 재고 차감 + 매진임박 알림 + 포인트 적립
```

④는 GPU 추론 서버 미연결 상태라 501을 반환합니다. 프론트는 이를 오류가 아닌 "미구현"으로
처리해 안내 문구를 띄우고 인식 화면으로 되돌아가며, 직원은 카탈로그 직접 추가만으로 계산을
완결할 수 있습니다(FR-10, NFR-03).

### API 구성

| 라우터            | 엔드포인트                                                                    |
| ----------------- | ----------------------------------------------------------------------------- |
| `/orders`         | 생성·진행 중 주문 복구·목록·상세·항목 추가/수정/삭제·할인·취소·회원 연결/해제·결제 (12) |
| `/products`       | 목록·상세·등록·수정·추천 (5)                                                  |
| `/scan-sessions`  | 생성·조회·인식·취소·폐기 (5)                                                  |
| `/inventory`      | 조회·재고 조정 (2)                                                            |
| `/notifications`  | 목록·안읽음 수·개별 읽음·전체 읽음·삭제 (5)                                   |
| `/storage`        | 이미지 업로드·서명 URL (2)                                                    |
| `/dashboard`      | 운영 현황 요약 (1)                                                            |
| `/stats`          | 판매 통계 (1)                                                                 |
| `/members`        | CJ ONE 회원 조회 (1)                                                          |
| `/me`             | 현재 직원 정보 (1)                                                            |

`/api` 아래 35개 + `/api` 밖 헬스체크 2개. 전체 규약은 Notion **스냅빵\_API명세서 v2.0** 참고.

---

## 기술 스택

| 영역          | 기술                                                                |
| ------------- | ------------------------------------------------------------------- |
| 리버스 프록시 | Nginx (자체 서명 TLS 자동 생성)                                     |
| 프론트엔드    | Next.js 15 (App Router, JSX) · React 18 · Tailwind CSS 3            |
| 상태·통신     | TanStack Query 5, Zustand 5, Axios 1, Zod 4                         |
| UI            | Radix UI Primitives, Chart.js 4 + react-chartjs-2, lucide-react     |
| 백엔드        | FastAPI 0.115, RESTful `/api/*`, Swagger `/api/docs`                |
| DB            | Supabase (PostgreSQL, 클라우드 매니지드) — 16개 테이블              |
| 파일 저장소   | Supabase Storage (비공개 버킷 + 서명 URL)                           |
| 인증          | Supabase Auth JWT (MVP는 `AUTH_DISABLED=true`로 우회)               |
| 로깅·모니터링 | structlog JSON 로깅 + Prometheus `/metrics`                         |
| CI            | GitHub Actions 3종 (아래 「브랜치 · CI」 참고)                       |
| 배포          | Docker Compose (Nginx + Next.js + FastAPI)                          |
| GPU           | 별도 컨테이너 (`backend/Dockerfile.gpu` + `docker-compose.gpu.yml`) |

Supabase는 클라우드에 이미 생성된 프로젝트에 붙는 방식입니다(로컬 Supabase 컨테이너 없음).
프론트엔드는 TypeScript가 아닌 JSX를 쓰고 Tailwind는 4가 아닌 3을 씁니다 — 결정 배경은
[`frontend/.claude/rules/frontend.md`](./frontend/.claude/rules/frontend.md)에 있습니다.

---

## 화면 구성

UX 설계서 기준 12개 화면(S-01~S-12)을 실제로는 **3개 라우트**에 담았습니다.

| 라우트                                                                 | 화면군                                   | 담기는 Screen ID           |
| ---------------------------------------------------------------------- | ---------------------------------------- | -------------------------- |
| `/pos`                                                                 | 직원 계산 (태블릿 1280×800)              | S-01 · S-02 · S-03 · S-04  |
| `/pos` 내부 고객용 Floating Display (390×624)                          | 고객 안내 (조작은 CJ ONE 입력만)         | S-08 · S-09 · S-10         |
| `/dashboard`, `/dashboard/inventory`·`products`·`sales`·`alerts`       | 매니저 운영 관리 (웹 1440×900)           | S-06 · S-07 · S-11 · S-12  |

계산 흐름은 화면 전환 없이 한 라우트 안에서 촬영 화면과 인식 화면을 오갑니다. 고객 화면은
독립 기기가 아니라 직원 상태를 구독하는 표시 전용 파생 뷰이며, 조작 지점은 CJ ONE 번호 입력
한 곳뿐입니다. 계산 흐름과 운영 관리 흐름은 진입 경로가 완전히 분리되어 있습니다.

UI 용어는 **"촬영"** 으로 통일합니다("스캔"은 금지어). 재고는 추정치이므로 "재고 12개"가 아니라
**"추정 12개"** 로 표기하고, 자동 발주로 이어지지 않음을 화면에 명시합니다(NFR-07).

화면별 역할·예외 흐름·라이팅 규칙은
[`frontend/.claude/rules/ux.md`](./frontend/.claude/rules/ux.md)를 기준으로 합니다.

---

## 데이터 모델

DB 설계서 기준 6개 도메인 16개 테이블. snake_case, `BIGINT` 대리키, 상태값은 ENUM 대신
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
ERD는 Notion **스냅빵\_DB설계서 v3.0** 참고.

---

## 디렉터리 구조

```
.
├── docker-compose.yml
├── docker-compose.override.yml   # 로컬 개발용: 볼륨 마운트 + 핫리로드 (자동 적용)
├── docker-compose.gpu.yml        # GPU 인스턴스용 오버레이 (opt-in)
├── DOCKER_GUIDE.md               # 환경 세팅 입문 가이드
├── .github/workflows/
│   ├── backend-ci.yml            # ruff → pytest → docker build
│   ├── frontend-ci.yml           # lint → format:check → build
│   └── pr-guard.yml              # master PR 출처 검사
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
│   ├── tests/                    # 16개 파일 96개 테스트
│   └── app/
│       ├── main.py               # 앱 초기화, CORS, 요청 로깅, 라우터·메트릭 마운트
│       ├── core/                 # 설정·인증·에러·페이지네이션·마스킹·시각·메트릭 등 공통
│       ├── services/orders.py    # 주문 금액 계산·상태 전이 등 도메인 로직
│       ├── schemas/              # 16개 테이블 pydantic 모델 + 요청/응답 스키마
│       └── api/
│           ├── router.py         # 공개 API를 "/api" prefix로 묶음
│           └── routes/           # orders · products · scan_sessions · inventory
│                                 # notifications · members · dashboard · stats
│                                 # storage · me · health
└── frontend/                     # Next.js (JSX) + Tailwind
    ├── .claude/                  # 협업 규칙 — 코드를 만지기 전에 먼저 읽는 문서
    │   ├── CLAUDE.md
    │   └── rules/                # ux · frontend · git-flow · design(foundation/pos/dashboard)
    └── src/
        ├── app/
        │   ├── page.jsx          # 홈
        │   ├── pos/              # 직원 POS + 고객 Floating Display
        │   │   ├── page.jsx
        │   │   ├── state/        # usePosState · useKeyboardShortcuts
        │   │   ├── api/          # orders · products · inventory · scan-sessions
        │   │   ├── components/   # ai-capture · cart · customer-display · membership
        │   │   │                 # payment · product-catalog · feedback · layout
        │   │   └── data/         # 빵 노출 순서, 음료 카탈로그(프론트 전용)
        │   └── dashboard/        # 운영 현황 + inventory · products · sales · alerts
        │       ├── api/          # 화면별 fetch + Zod 검증
        │       ├── components/   # 사이드바 · 상단바 · 공통 UI
        │       └── *-data.js     # 응답 → view model 순수 매핑
        └── lib/api.js            # 백엔드 호출 헬퍼
```

---

## 브랜치 · CI

```
feature/ fix/ docs/ refactor/ chore/  →  dev-fe / dev-be  →  test  →  master
```

- `master` — 배포 기준. **PR은 `test`(또는 긴급 시 `hotfix/*`)에서만 엽니다.**
- `test` — FE/BE 통합 검증. `dev-fe`·`dev-be` 외에 동기화용 브랜치에서도 PR이 들어옵니다.
- `master`는 보호 브랜치라 직접 push할 수 없고 PR을 거쳐야 합니다. `test`는 통합 편의를 위해 직접 push를 허용합니다(force push는 차단).
- 머지 방식은 Squash and merge, 커밋·PR 제목은 Conventional Commits를 따릅니다.

| 워크플로           | 트리거                              | 검사                          |
| ------------------ | ----------------------------------- | ----------------------------- |
| `backend-ci.yml`   | 모든 PR / master·test·dev-be push   | ruff → pytest → docker build  |
| `frontend-ci.yml`  | 모든 PR / master·test·dev-fe push   | lint → format:check → build   |
| `pr-guard.yml`     | master 대상 PR                      | head 브랜치가 test/hotfix인지 |

두 CI는 PR에서 `paths` 필터 없이 항상 실행합니다 — 필수 상태 체크로 지정했을 때 해당 영역
변경이 없는 PR이 "대기 중"으로 막히는 것을 피하기 위함입니다. 자세한 규칙은
[`frontend/.claude/rules/git-flow.md`](./frontend/.claude/rules/git-flow.md) 참고.

---

## Docker 없이 실행

```bash
# 백엔드
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv/Scripts/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload    # http://localhost:8000
ruff check . && pytest

# 프론트엔드
cd frontend
npm ci
npm run dev                       # http://localhost:3000
npm run lint && npm run format:check && npm run build
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

**동작하는 것**

| 영역          | 내용                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| 직원 POS      | 주문 생성·복구, 상품 카탈로그 직접 추가, 수량 증감·삭제, 매진 차단, CJ ONE 적립, 결제·재결제, 계산 취소, 단축키   |
| 고객 화면     | 주문 내역 실시간 미러링, 인기 상품 TOP3, CJ ONE 키패드·건너뛰기, 결제 상태 표시                                  |
| 운영 대시보드 | 운영 현황(KPI·시간대별 매출·상위 품목·최근 판매), 재고 관리·조정, 상품 마스터, 판매 통계·상세, 알림              |
| 백엔드        | `/api` 35개 엔드포인트, 주문 금액 계산·상태 전이, 재고 차감, 매진임박 알림, 포인트 적립, 16개 테이블 pydantic 모델 |
| 인프라        | Nginx 리버스 프록시 + HTTPS, structlog JSON 로깅, Prometheus `/metrics`, CI 3종                                  |

**남아 있는 것**

| 항목                                | 상태                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `/api/scan-sessions/{id}/recognize` | GPU 추론 서버 미연결로 501 반환하는 stub — 현재 계산은 직접 추가로 완결      |
| 오탐 재선택 UI (FR-05)              | `PATCH /orders/{id}/items/{id}`는 준비 완료, 화면 컨트롤 미구현              |
| 직원 할인 오버라이드 (FR-08)        | API 래퍼는 존재, 화면 진입점 미구현                                         |
| 포인트 사용 (FR-18)                 | 적립만 동작, `point_used`는 0 고정                                           |
| S-05 금일 판매 현황                 | POS 진입점 미구현                                                           |
| 음료(DRINK)                         | 프론트엔드 로컬 상태로만 처리 — 판매·재고에 반영되지 않음                    |

**MVP 범위 밖** — 로그인 화면·직원 전환·화면 잠금, 세트/프로모션 할인, 반품·환불, 본사
대시보드, 품절 예측·생산 추천, 실제 POS/PG 연동.

---

## 참고 문서 (Notion)

| 문서                          | 내용                                                    |
| ----------------------------- | ------------------------------------------------------- |
| 뚜레쥬르 요구사항 명세서 v1.0 | FR-01~FR-23, NFR-01~NFR-07, 화면 목록                   |
| 스냅빵\_DB설계서 v3.0         | 16개 테이블 ERD·컬럼 명세·공통 코드표·FR 매핑           |
| 스냅빵\_API명세서 v2.0        | 엔드포인트·공통 규약·에러·타임존·코드표                 |
| UX 설계서 v3.0                | 화면 정의(S-01~S-12), 상태 전이, 오류 처리, 라이팅 규칙 |
| 유저 시나리오                 | 페르소나, 시나리오, 니즈·행동·기능 매핑                 |
| StructLog                     | 로그 이벤트 규약                                        |
