# 스냅빵 Frontend

CJ푸드빌 뚜레쥬르 'Vision AI 기반 빵 인식·계산·재고 운영 최적화 시스템'(스냅빵)의 프론트엔드입니다. 계산대 직원용 POS 화면, 그 위에 뜨는 고객 안내 화면, 매니저용 운영 대시보드를 이 저장소 하나에서 서빙합니다.

> 사용자 흐름·화면별 역할·디자인 원칙·개발 규율은 [`.claude/`](./.claude) 문서를 기준으로 합니다 — 코드를 보기 전에 [`.claude/CLAUDE.md`](./.claude/CLAUDE.md)를 먼저 읽어주세요.

## 기술 스택

| 분류          | 라이브러리                                                                                           | 비고                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Framework     | Next.js 15 (App Router), React 18                                                                    | 언어는 JavaScript/JSX — TypeScript 아님(의도적 결정) |
| Server state  | TanStack Query 5                                                                                     | 대시보드 조회 캐싱·재시도 정책                       |
| Validation    | Zod 4                                                                                                | API 응답 스키마 검증                                 |
| Style         | Tailwind CSS 3 + CSS Modules                                                                         | 화면 단위 스타일은 `*.module.css`                    |
| UI            | Radix UI (`radix-ui` 단일 패키지)                                                                    | Dialog · Select · DropdownMenu · ToggleGroup         |
| Chart         | Chart.js 4 + react-chartjs-2 5                                                                       | 대시보드 매출·상위 품목 차트                         |
| Icon          | lucide-react                                                                                         | 사이드바·버튼 아이콘                                 |
| Lint / Format | ESLint(`next/core-web-vitals` + `eslint-config-prettier`), Prettier(+ `prettier-plugin-tailwindcss`) | `npm run lint`, `npm run format`                     |
| CI            | GitHub Actions(`frontend-ci.yml`)                                                                    | lint → format:check → build                          |

버전 확정 배경과 왜 Tailwind 4가 아닌 3인지, 왜 TypeScript가 아닌지는 [`.claude/rules/frontend.md`](./.claude/rules/frontend.md)에 정리되어 있습니다.

> `package.json`에는 Supabase 클라이언트, Zustand, Axios, React Hook Form, date-fns, clsx, tailwind-merge도 남아 있지만 **현재 `src/`에서 쓰지 않습니다.** 로그인 화면을 뒤로 미루면서 함께 빠졌고, 정리 여부는 아직 정하지 않았습니다.

## 시스템 아키텍처

이 저장소(frontend)는 전체 시스템에서 아래 위치에 있습니다.

```
브라우저
  │
  ▼
Nginx(:80 → 301 리다이렉트, :443 HTTPS)
  ├─ "/"       ─▶ frontend (Next.js, 이 저장소, :3000)
  └─ "/api/*"  ─▶ backend  (FastAPI, :8000)

backend ──(service_role 키)──▶ Supabase (DB / Storage)
```

- **MVP는 로그인이 없습니다.** 백엔드가 `AUTH_DISABLED=true`로 시드 고정 직원(`store_id=1`, `staff_id=1`, role `MANAGER`)을 사용하므로 프론트엔드는 토큰을 붙이지 않습니다.
- DB/Storage에는 프론트엔드가 직접 접근하지 않고 항상 백엔드(FastAPI)를 경유합니다.
- 호출 헬퍼는 두 벌입니다. 대시보드는 `src/lib/api.js`, POS는 명세서 v2.0의 에러 형태(`{error:{code,message,trace_id}}`)를 `ApiError`로 파싱하는 `src/app/pos/api/httpClient.js`를 씁니다.

## 화면 구성 및 주요 흐름

프론트엔드가 다루는 화면은 크게 두 흐름으로 나뉩니다 — **POS·고객 계산 흐름**(직원 조작, 고객은 표시 전용)과 **운영 관리 흐름**(매니저 조회·관리). 전체 세부 사항(역할별 조작 범위, 예외 흐름, 화면 전환 원칙, 변경 금지 사항)은 [`.claude/rules/ux.md`](./.claude/rules/ux.md)를 기준으로 하며, 여기서는 개요만 요약합니다.

### POS·고객 계산 흐름 — `/pos`

| Screen ID | 화면                | 사용자                  | 구현 위치                            |
| --------- | ------------------- | ----------------------- | ------------------------------------ |
| S-01      | 촬영                | 직원                    | `components/ai-capture/`             |
| S-02      | 인식 결과·수정      | 직원                    | `components/layout/`, `cart/`        |
| S-03      | 결제                | 직원                    | `components/payment/`, `membership/` |
| S-04      | 결제 완료           | 직원                    | `components/payment/`                |
| S-08      | 계산 목록·메뉴 추천 | 고객 (표시 전용)        | `components/customer-display/`       |
| S-09      | CJ ONE 입력         | 고객 (유일한 고객 조작) | `components/membership/PhoneKeypad`  |
| S-10      | 계산 진행 상태      | 고객 (표시 전용)        | `components/customer-display/`       |

```
S-01 촬영 → 인식 → S-02 인식 결과·수정 → 촬영 완료 확인
  → S-03 결제 진입 → (고객 화면: CJ ONE 입력/건너뛰기) → 결제
  → S-04 결제 완료 → 판매 데이터 반영 → 새 손님 받기
```

7개 화면이 라우트 하나에 들어 있습니다. 계산 흐름에는 네비게이션이 없고, 촬영 화면과 인식 화면만 상태로 전환합니다. 고객 화면(S-08~S-10)은 독립 기기가 아니라 직원 상태(`usePosState`)를 구독하는 390×624 고정 크기의 Floating Display이며, 조작 지점은 CJ ONE 번호 입력 한 곳뿐입니다.

예외 흐름(인식 실패 4갈래 분기, 계산 취소, 결제 실패 등)은 `.claude/rules/ux.md` §5를 참고하세요. AI 추론 서버가 아직 붙지 않아 `POST /scan-sessions/{id}/recognize`는 501을 반환하며, 프론트는 이를 오류가 아닌 "미구현"으로 처리해 안내 문구를 띄우고 인식 화면으로 되돌아갑니다. 직원은 카탈로그 직접 추가만으로 계산을 완결할 수 있습니다.

### 운영 관리 흐름 — `/dashboard`

| Screen ID | 화면        | 라우트                 |
| --------- | ----------- | ---------------------- |
| —         | 운영 현황   | `/dashboard`           |
| S-11      | 재고 관리   | `/dashboard/inventory` |
| S-06      | 상품 마스터 | `/dashboard/products`  |
| S-07      | 판매 통계   | `/dashboard/sales`     |
| S-12      | 재고 알림   | `/dashboard/alerts`    |

```
사이드바 진입 (판단 → 조치 순서)
  운영 현황 → S-12 재고 알림 → S-11 재고 관리 → S-07 판매 통계 → S-06 상품 마스터
```

계산 흐름(POS·고객)과 운영 관리 흐름은 진입 경로가 완전히 분리되어 있습니다 — 직원 POS·고객 화면에는 관리 화면 진입 경로가 없고, 매니저 화면도 계산 흐름으로 넘어가는 경로가 없습니다. 운영 현황(KPI 요약) 화면은 `.claude/rules/ux.md` §10에서 보류로 정해 두었던 화면인데 먼저 구현된 상태라, 규칙 문서와의 정합을 다시 확인해야 합니다.

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
│   ├── app/
│   │   ├── page.jsx           홈
│   │   ├── pos/               직원 POS + 고객 Floating Display
│   │   │   ├── page.jsx
│   │   │   ├── state/          usePosState(주문·촬영·회원·결제 상태), useKeyboardShortcuts
│   │   │   ├── api/            httpClient · orders · products · inventory · scanSessions
│   │   │   ├── components/     ai-capture · cart · customer-display · membership
│   │   │   │                   payment · product-catalog · feedback · layout
│   │   │   ├── data/           빵 노출 순서, 음료 카탈로그(프론트 전용)
│   │   │   ├── helpers/        금액·전화번호 포맷
│   │   │   └── pos.module.css
│   │   └── dashboard/         운영 현황 + inventory · products · sales · alerts
│   │       ├── api/            화면별 fetch + Zod 응답 검증
│   │       ├── components/     사이드바 · 상단바 · 공통 UI(Card, Button, TableCard 등)
│   │       ├── *-data.js       응답 → view model 순수 매핑 (React 비의존)
│   │       ├── *-mock-data.js  API 연결 전 화면 확인용 목업
│   │       └── *.module.css
│   └── lib/api.js             백엔드 호출 헬퍼
├── .eslintrc.json / .prettierrc.json / .prettierignore
├── tailwind.config.js / postcss.config.mjs
└── next.config.mjs            output: 'standalone'
```

화면별 폴더는 **페이지(page.jsx) → 내용(_PageContent.jsx) → 데이터 매핑(_-data.js) → 요청(api/)** 순으로 책임을 나눕니다. `*-data.js`는 React나 브라우저 API에 의존하지 않는 순수 함수만 두어 응답 형태가 바뀌어도 화면 컴포넌트를 건드리지 않게 합니다.

## 시작하기

```bash
cp .env.local.example .env.local   # Supabase 값 채우기
npm ci
npm run dev                        # http://localhost:3000
```

Docker Compose로 전체 스택(Nginx + frontend + backend)을 같이 띄우는 방법은 저장소 루트의 [`README.md`](../README.md)와 [`DOCKER_GUIDE.md`](../DOCKER_GUIDE.md)를 참고하세요.

### 필요한 환경 변수 (`.env.local`)

| 변수                            | 설명                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 프로젝트 URL                                                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key                                                            |
| `NEXT_PUBLIC_API_URL`           | 백엔드 API 베이스 경로 (Nginx 경유 시 `/api`, 직접 실행 시 `http://localhost:8000`) |

Supabase 값은 빌드 시점에 필요해 예제 파일에 남겨 두었습니다. 현재 화면 코드에서 직접 쓰지는 않습니다.

## 스크립트

| 명령어                 | 설명                                    |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | 개발 서버 실행                          |
| `npm run build`        | 프로덕션 빌드                           |
| `npm run start`        | 프로덕션 서버 실행                      |
| `npm run lint`         | ESLint 검사                             |
| `npm run format`       | Prettier로 전체 포맷                    |
| `npm run format:check` | Prettier 포맷 여부만 확인 (CI에서 사용) |

CI(`../.github/workflows/frontend-ci.yml`)는 **모든 PR과 master·test·dev-fe push마다** `lint → format:check → build` 순서로 위 스크립트를 그대로 실행합니다. PR에서는 `paths` 필터를 두지 않아 프론트엔드 변경이 없는 PR에서도 항상 돌아갑니다.

push 전에 세 명령을 로컬에서 먼저 통과시키는 것이 규율입니다([`.claude/rules/frontend.md`](./.claude/rules/frontend.md) Verification).

```bash
npm run lint && npm run format:check && npm run build
```
