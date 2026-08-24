# Frontend 개발 환경 기준

프론트엔드 기술 스택과, 코드를 변경한 뒤 스스로 검증하는 방식을 정의한다. 폴더 구조, 코딩 컨벤션, API 호출 패턴, 상태 관리 사용 패턴, 테스트 환경은 아직 확정되지 않았다 — 이 문서에 없는 내용은 임의로 정하지 않고 먼저 확인한다.

## 확정된 기술 스택

| 분류 | 라이브러리 |
|---|---|
| Framework | Next.js 15 (App Router), React 18 |
| 언어 | JavaScript / JSX |
| State | Zustand (클라이언트 상태), TanStack Query (서버 상태) |
| Network | Axios, Zod (검증) |
| Form | React Hook Form |
| Style | Tailwind CSS 3, Radix UI Primitives |
| Chart | Chart.js, react-chartjs-2 |
| Utils | date-fns, lucide-react, clsx, tailwind-merge |
| Lint / Format | ESLint(`next/core-web-vitals` + `eslint-config-prettier`), Prettier(+ `prettier-plugin-tailwindcss`) |

## 언어 관련 결정

이 프로젝트는 TypeScript에서 JavaScript/JSX로 전환한 이력이 있고(master 브랜치에 이미 반영됨), 기술 스택을 확정하는 과정에서도 JS/JSX 유지로 재확인했다. **TypeScript를 다시 도입하지 않는다.** 필요하다고 판단되어도 임의로 `.ts`/`.tsx` 파일이나 `tsconfig.json`을 추가하지 않고 먼저 확인한다.

## Verification (코드 변경 후 자체 검증)

코드를 변경한 뒤에는 가능한 범위에서 다음을 수행한다.

1. **lint** — `npm run lint`
2. **format:check** — `npm run format:check` (실패 시 `npm run format`으로 적용한 뒤 diff를 확인한다)
3. **test** — 아직 테스트 러너가 없다(별도 테스트 브랜치에서 도입 예정). 러너가 추가되기 전까지는 생략한다.
4. **build** — `npm run build`

- typecheck 단계는 두지 않는다 — 프로젝트가 JavaScript이므로 해당 사항 없다.
- 검증 실패를 숨기거나 임의로 무시하지 않는다.
- 실패한 항목과 원인을 사용자에게 그대로 보고한다. 우회하거나 실패를 감추고 다음 단계로 넘어가지 않는다.

## CI (GitHub Actions)

`.github/workflows/frontend-ci.yml`에서 `frontend/` 변경이 포함된 push·PR마다 lint → format:check → build를 순서대로 실행한다. 테스트 러너가 도입되면 이 워크플로에 test 단계를 추가한다.

로컬 pre-commit 훅(Husky 등)은 두지 않기로 결정했다 — CI가 유일한 검증 게이트다. 훅을 임의로 추가하지 않는다.
