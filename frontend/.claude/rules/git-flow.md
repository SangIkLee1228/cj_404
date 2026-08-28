# Git Flow — 브랜치 · 커밋 · PR 규칙

프론트엔드(`frontend/`) 작업 시 따르는 브랜치·커밋·PR 규칙이다.

## 브랜치 전략

- **`master`** — 배포 기준 브랜치.
- **`test`** — FE/BE 통합 검증 브랜치. `master` 직전 단계다.
- **`dev-fe` / `dev-be`** — 프론트엔드·백엔드 개발 통합 브랜치. 작업 브랜치는 여기서 분기하고, 작업이 끝나면 다시 해당 브랜치로 PR을 올린다.
- 승격 순서는 다음 한 방향으로만 흐른다.

```
feature/ fix/ docs/ refactor/ chore/  ->  dev-fe / dev-be  ->  test  ->  master
```

- **`master`로의 PR은 `test`에서만 연다.** `dev-fe`·`dev-be`·작업 브랜치는 `master`로 직접 PR을 열지 않는다. 릴리스 직전 긴급 수정에 한해 `hotfix/`로 분기해 `master`로 직접 PR을 열 수 있다.
- `test`는 통합 검증 브랜치라 `dev-fe`·`dev-be` 외에 동기화용 `chore/`·`fix/` 브랜치에서도 PR이 들어온다 — 출처를 제한하지 않는다.
- `.github/workflows/pr-guard.yml`은 `master`로 향하는 PR의 출처만 검사한다.

## 브랜치 네이밍

`prefix/설명` 형식, 설명은 kebab-case로 작성한다.

| prefix | 용도 | 예시 |
|---|---|---|
| `feature/` | 신규 기능 | `feature/pos-scan-ui` |
| `fix/` | 버그 수정 | `fix/cj-one-input-validation` |
| `docs/` | 문서(rules, README 등) 변경 | `docs/ux-rules-update` |
| `refactor/` | 동작 변경 없는 구조 개선 | `refactor/api-client` |
| `chore/` | 빌드·설정·의존성 등 | `chore/eslint-prettier-setup` |

## 커밋 메시지 (Conventional Commits)

```
<type>(<scope>): <description>
```

- `scope`는 선택. 화면/모듈 단위로 쓴다 (예: `pos`, `dashboard`, `auth`).
- `type` 목록: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`
- `description`은 명령문으로 간결하게 — 한글/영문 모두 가능.

예시:
```
feat(pos): 촬영 완료 확인 모달 추가
fix(dashboard): 재고 알림 배지 카운트 오류 수정
chore: ESLint/Prettier 설정 추가
```

- 본문(body)이 필요하면 "무엇을 했는지"가 아니라 "왜 했는지"를 적는다 — "무엇"은 diff로 충분하다.
- `rules/ux.md`에서 금지한 것(폐기 기능 재구현, FR/Screen ID 임의 변경 등)은 애초에 하지 않으므로 커밋에 남을 일이 없다.

## PR 전략

- **머지 방식은 Squash and merge다.** `dev-fe`/`master` 히스토리는 PR당 커밋 1개로 유지한다.
- PR 제목은 Conventional Commits 형식을 따른다 — squash 시 그 제목이 최종 커밋 메시지가 된다.
- PR 설명은 저장소 기본 템플릿(`.github/PULL_REQUEST_TEMPLATE.md`)을 그대로 채운다 — 요약, 관련 Screen ID, 검증(lint/format/build), 체크리스트를 포함한다.
- `frontend-ci.yml`(lint → format:check → build)과 `backend-ci.yml`(ruff → pytest → docker build)이 통과해야 머지 가능한 상태로 본다. 두 워크플로 모두 PR에서는 paths 필터 없이 항상 실행된다 — 필수 상태 체크로 지정했을 때 해당 영역 변경이 없는 PR이 대기 상태로 막히지 않게 하기 위함이다.

## Claude 작업 시 원칙

- **push하기 전에 `rules/frontend.md`의 Verification(lint/format:check/build) 결과와 변경 diff를 사용자에게 보여주고 확인받는다.** 확인 전에는 push하지 않는다.
- **커밋 메시지에 Claude를 공동 작성자(Co-Authored-By 등)로 표기하지 않는다.** 예외 없이 지킨다.
- **force push(`git push --force`, `--force-with-lease` 포함)를 하지 않는다.** 예외 없이 지킨다 — 필요하다고 판단되어도 사용자에게 먼저 확인한다.
- **`master`·`test`로 직접 PR을 열지 않는다.** 작업 브랜치의 PR 대상은 항상 `dev-fe` 또는 `dev-be`다.
- 브랜치 삭제, 커밋 amend, `git reset --hard` 등 되돌리기 어려운 git 작업은 사용자 확인 없이 실행하지 않는다.
- 커밋·PR을 만들기 전에 `rules/frontend.md`의 Verification(lint/build)이 통과하는지 먼저 확인한다.

## GitHub 저장소 설정 (관리자 작업 필요)

아래는 CI로 대신할 수 없고 **저장소 admin 권한**이 있어야 설정 가능한 항목이다. 현재 작업 계정은 push 권한만 있고 admin이 아니므로, 저장소 관리자에게 아래 설정을 요청해야 실질적으로 강제된다.

`master` 브랜치 보호 규칙(Settings → Branches → Add rule → `master`)에서:
- **Require a pull request before merging** — `master`로의 직접 push를 막는다.
- **Require status checks to pass before merging** — `Frontend CI`, `backend-ci`, `PR Target Guard`를 필수 체크로 지정한다.
- **Do not allow force pushes** — force-push를 GitHub 레벨에서 원천 차단한다. (CI는 이미 일어난 뒤에 실행되므로 force-push 자체를 막지 못한다 — 이 설정만이 실제 차단 수단이다.)

이 설정이 되어 있지 않으면, 위 "Claude 작업 시 원칙"과 `pr-guard.yml`은 어디까지나 절차적 안전장치이지 기술적으로 강제되는 것은 아니다.
