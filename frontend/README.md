# 스냅빵 Frontend

CJ푸드빌 뚜레쥬르 'Vision AI 기반 빵 인식·계산·재고 운영 최적화 시스템'(스냅빵)의 프론트엔드입니다. 계산대 직원용 POS 화면, 고객 안내 화면, 매니저용 운영 대시보드를 이 저장소 하나에서 서빙합니다.

> 사용자 흐름·화면별 역할·디자인 원칙·개발 규율은 [`.claude/`](./.claude) 문서를 기준으로 합니다 — 코드를 보기 전에 [`.claude/CLAUDE.md`](./.claude/CLAUDE.md)를 먼저 읽어주세요.

## 기술 스택

| 분류          | 라이브러리                                                                                           | 비고                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Framework     | Next.js 15 (App Router), React 18                                                                    | 언어는 JavaScript/JSX — TypeScript 아님(의도적 결정) |
| State         | Zustand 5                                                                                            | 클라이언트 상태 (예: 인증 세션)                      |
|               | TanStack Query 5                                                                                     | 서버 상태 캐싱                                       |
| Network       | Axios 1                                                                                              | HTTP 클라이언트                                      |
|               | Zod 4                                                                                                | 스키마 검증                                          |
| Form          | React Hook Form 7                                                                                    | 폼 상태·검증                                         |
| Style         | Tailwind CSS 3                                                                                       | 유틸리티 CSS                                         |
|               | Radix UI Primitives                                                                                  | 접근성 갖춘 헤드리스 컴포넌트                        |
| Chart         | Chart.js 4 + react-chartjs-2 5                                                                       | 대시보드 차트                                        |
| Utils         | date-fns 4, lucide-react, clsx, tailwind-merge                                                       | 날짜/아이콘/클래스명 유틸                            |
| Lint / Format | ESLint(`next/core-web-vitals` + `eslint-config-prettier`), Prettier(+ `prettier-plugin-tailwindcss`) | `npm run lint`, `npm run format`                     |
| Auth / DB     | Supabase Auth, `@supabase/ssr`, `@supabase/supabase-js`                                              | 브라우저에서 Supabase Auth로 직접 로그인             |
| CI            | GitHub Actions(`frontend-ci.yml`)                                                                    | lint → format:check → build                          |

버전 확정 배경과 왜 Tailwind 4가 아닌 3인지, 왜 TypeScript가 아닌지는 [`.claude/rules/frontend.md`](./.claude/rules/frontend.md)에 정리되어 있습니다.

## 시스템 아키텍처

이 저장소(frontend)는 전체 시스템에서 아래 위치에 있습니다.

```
브라우저
  │
  ├── Supabase Auth 로 직접 로그인 (email/password) ─────────────▶ Supabase Auth
  │
  ▼
Nginx(:80 → 301 리다이렉트, :443 HTTPS)
  ├─ "/"       ─▶ frontend (Next.js, 이 저장소, :3000)
  └─ "/api/*"  ─▶ backend  (FastAPI, :8000)

frontend ──(Authorization: Bearer <access_token>)──▶ backend
backend  ──(service_role 키)──▶ Supabase (DB / Storage)
```

- 로그인은 프론트엔드가 Supabase Auth를 **직접** 호출합니다(백엔드를 거치지 않음).
- 백엔드를 호출할 때는 Supabase가 발급한 access token을 `Authorization: Bearer <token>` 헤더에 실어 보냅니다(`src/lib/api.js`).
- `src/middleware.js`가 세션을 갱신하고 `/dashboard` 등 보호 경로 진입을 막습니다.
- DB/Storage에는 프론트엔드가 직접 접근하지 않고 항상 백엔드(FastAPI)를 경유합니다.

## 화면 구성 및 주요 흐름

프론트엔드가 다루는 화면은 크게 두 흐름으로 나뉩니다 — **POS·고객 계산 흐름**(직원 조작, 고객은 표시 전용)과 **운영 관리 흐름**(매니저 조회·관리). 전체 세부 사항(역할별 조작 범위, 예외 흐름, 화면 전환 원칙, 변경 금지 사항)은 [`.claude/rules/ux.md`](./.claude/rules/ux.md)를 기준으로 하며, 여기서는 개요만 요약합니다.

### POS·고객 계산 흐름

| Screen ID | 화면                | 사용자                  |
| --------- | ------------------- | ----------------------- |
| S-01      | 촬영                | 직원                    |
| S-02      | 인식 결과·수정      | 직원                    |
| S-03      | 결제                | 직원                    |
| S-04      | 결제 완료           | 직원                    |
| S-08      | 계산 목록·메뉴 추천 | 고객 (표시 전용)        |
| S-09      | CJ ONE 입력         | 고객 (유일한 고객 조작) |
| S-10      | 계산 진행 상태      | 고객 (표시 전용)        |

```
S-01 촬영 → 인식 → S-02 인식 결과·수정 → 촬영 완료 확인
  → S-03 결제 진입 → (고객 화면: CJ ONE 입력/건너뛰기) → 결제
  → S-04 결제 완료 → 판매 데이터 반영 → S-01 복귀
```

고객 화면(S-08~S-10)은 독립된 조작 흐름이 아니라 직원 조작을 그대로 미러링하는 파생 뷰입니다. 예외 흐름(인식 실패 4갈래 분기, 계산 취소, 결제 실패 등)은 `.claude/rules/ux.md` §5를 참고하세요.

### 운영 관리 흐름 (대시보드)

| Screen ID | 화면        | 사용자 |
| --------- | ----------- | ------ |
| S-06      | 상품 마스터 | 매니저 |
| S-07      | 판매 통계   | 매니저 |
| S-11      | 재고 관리   | 매니저 |
| S-12      | 재고 알림   | 매니저 |

```
사이드바 진입 (판단 → 조치 순서)
  S-12 재고 알림 → S-11 재고 관리 → S-07 판매 통계 → S-06 상품 마스터
```

계산 흐름(POS·고객)과 운영 관리 흐름은 진입 경로가 완전히 분리되어 있습니다 — 직원 POS·고객 화면에는 관리 화면 진입 경로가 없고, 매니저 화면도 계산 흐름으로 넘어가는 경로가 없습니다. 매니저용 KPI 요약 대시보드와 별도 판매 내역 화면은 아직 확정되지 않은 상태입니다(`.claude/rules/ux.md` §9~10 참고).

## 폴더 구조

```
frontend/
├── .claude/                  협업 규칙 — 코드를 만지기 전에 먼저 읽는 문서
│   ├── CLAUDE.md
│   └── rules/
│       ├── ux.md              사용자 흐름·역할·UX 정책
│       ├── frontend.md        확정 기술 스택 · 자체 검증(Verification) 규율
│       ├── git-flow.md        브랜치·커밋·PR 규칙
│       └── design/            foundation / pos / dashboard 디자인 규칙
├── src/
│   ├── app/                  App Router 페이지 (/, /login, /dashboard)
│   ├── components/           supabase-auth-listener.jsx 등
│   ├── store/                useAuthStore.js (Zustand)
│   ├── lib/
│   │   ├── supabase/          브라우저/서버 Supabase 클라이언트
│   │   └── api.js             백엔드 호출 헬퍼(토큰 자동 첨부)
│   └── middleware.js          세션 갱신 + 보호 경로
├── .eslintrc.json / .prettierrc.json / .prettierignore
├── tailwind.config.js / postcss.config.mjs
└── next.config.mjs           output: 'standalone'
```

폴더 아키텍처(도메인별 분리 규칙, API 호출 패턴, 상태 관리 사용 패턴)는 아직 확정되지 않았습니다 — 위 트리는 현재 존재하는 파일 기준이며, 앞으로의 구조 원칙은 `.claude/rules/frontend.md`가 업데이트되면 그때 반영됩니다.

## 시작하기

```bash
cp .env.local.example .env.local   # Supabase 값 채우기
npm install
npm run dev                        # http://localhost:3000
```

Docker Compose로 전체 스택(Nginx + frontend + backend)을 같이 띄우는 방법은 저장소 루트의 [`README.md`](../README.md)와 [`DOCKER_GUIDE.md`](../DOCKER_GUIDE.md)를 참고하세요.

### 필요한 환경 변수 (`.env.local`)

| 변수                            | 설명                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 프로젝트 URL                                                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key                                                            |
| `NEXT_PUBLIC_API_URL`           | 백엔드 API 베이스 경로 (Nginx 경유 시 `/api`, 직접 실행 시 `http://localhost:8000`) |

## 스크립트

| 명령어                 | 설명                                    |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | 개발 서버 실행                          |
| `npm run build`        | 프로덕션 빌드                           |
| `npm run start`        | 프로덕션 서버 실행                      |
| `npm run lint`         | ESLint 검사                             |
| `npm run format`       | Prettier로 전체 포맷                    |
| `npm run format:check` | Prettier 포맷 여부만 확인 (CI에서 사용) |

CI(`../.github/workflows/frontend-ci.yml`)는 `frontend/` 변경이 포함된 push·PR마다 `lint → format:check → build` 순서로 위 스크립트를 그대로 실행합니다.
