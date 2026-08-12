# cj-x-vision Docker 환경 구축 가이드

이 문서는 Docker를 처음 써보는 팀원도 그대로 따라 하면 `cj-x-vision`을 자신의 컴퓨터에서
`https://localhost`로 띄울 수 있도록 처음부터 끝까지 순서대로 설명합니다. 막히는 부분이 있으면
건너뛰지 말고 팀 채널에 물어보세요 — 대부분 다른 팀원도 같은 곳에서 막힙니다.

## 0. 이 프로젝트는 어떻게 동작하나요?

우리 프로젝트는 3개의 작은 프로그램(서버)이 서로 연결되어 하나의 웹사이트처럼 동작합니다.

```
브라우저 (내 PC)
   │  https://localhost
   ▼
[Nginx]  ─── "/"       ──▶ [Next.js 프론트엔드]
         └── "/api/*"  ──▶ [FastAPI 백엔드] ──▶ Supabase (클라우드 DB/인증/파일저장소)
```

- **Nginx**: 문지기 역할. `https://localhost`로 들어온 요청을 주소에 따라 프론트엔드나 백엔드로
  전달합니다.
- **Next.js (프론트엔드)**: 우리가 브라우저에서 보는 화면.
- **FastAPI (백엔드)**: 데이터 처리, Supabase와의 통신을 담당하는 API 서버.
- **Supabase**: 우리 컴퓨터가 아니라 클라우드에 있는 데이터베이스/로그인/파일저장소 서비스.

**Docker**는 이 3개 프로그램을 각각 "컨테이너"라는 독립된 상자에 넣어서, 팀원 전체가 완전히
동일한 환경에서 실행할 수 있게 해주는 도구입니다. "내 컴퓨터에서는 되는데요?" 같은 문제를 없애는
게 목적입니다. **Docker Compose**는 이 여러 개의 컨테이너를 한 번에 켜고 끌 수 있게 묶어주는
도구고요. `docker-compose.yml` 파일이 바로 "어떤 컨테이너들을 어떻게 연결할지" 적어놓은 설계도
입니다.

즉, 우리가 할 일은 딱 두 가지입니다:

1. 접속에 필요한 비밀 값(Supabase 키 등)을 파일에 채워넣기
2. 명령어 한 줄(`docker compose up --build`) 실행하기

이 문서는 이 두 가지를 하기 위한 사전 준비부터 순서대로 안내합니다.

---

## 1. 사전 준비물 설치

### 1-1. Git 설치 확인

터미널(PowerShell 또는 명령 프롬프트)을 열고 아래 명령을 입력하세요.

```bash
git --version
```

`git version 2.x.x` 같은 문구가 나오면 이미 설치되어 있는 것입니다. 아무것도 안 나오거나
오류가 나면 [git-scm.com](https://git-scm.com/downloads)에서 설치하세요 (설치 중 옵션은 전부
기본값으로 두고 계속 진행하면 됩니다).

### 1-2. Docker Desktop 설치

**Windows 사용자**

1. [Docker Desktop 다운로드 페이지](https://www.docker.com/products/docker-desktop/)에서
   Windows용을 내려받아 설치합니다.
2. 설치 중 "Use WSL 2 instead of Hyper-V" 옵션이 나오면 체크된 채로 두고 진행합니다
   (WSL2는 Windows에서 리눅스 프로그램을 가볍게 돌리는 기술이고, Docker가 내부적으로 이걸
   사용합니다).
3. 설치가 끝나면 **재부팅**하라는 안내가 나올 수 있습니다. 나오면 재부팅하세요.
4. 재부팅 후 처음 Docker Desktop을 실행하면 WSL2 관련 업데이트를 요구할 수 있습니다. 안내
   문구에 있는 링크(`wsl --update`)를 그대로 따라 하면 됩니다.

**Mac 사용자**

1. [Docker Desktop 다운로드 페이지](https://www.docker.com/products/docker-desktop/)에서
   Mac용(Apple Silicon/Intel 중 본인 기종에 맞는 것)을 내려받아 설치합니다.
2. Applications 폴더의 Docker 아이콘을 실행합니다.

### 1-3. 설치 확인

Docker Desktop을 실행한 뒤 (작업표시줄/메뉴바에 고래 모양 아이콘이 뜨고 "Docker Desktop is
running" 상태가 될 때까지 기다린 후), 터미널에서 아래 두 명령을 입력합니다.

```bash
docker --version
docker compose version
```

둘 다 버전 정보가 출력되면 준비 완료입니다. `docker: command not found` 같은 오류가 나오면
Docker Desktop이 아직 실행 중이 아니거나 설치가 덜 된 것이니 1-2단계부터 다시 확인하세요.

> **참고**: Docker Desktop은 컴퓨터를 켤 때마다 자동 실행되도록 설정하는 것을 추천합니다
> (Docker Desktop 설정 → General → "Start Docker Desktop when you log in"). 꺼져 있으면
> 이후 모든 `docker` 명령이 "Docker Desktop이 실행 중이 아닙니다" 같은 오류를 냅니다.

---

## 2. 저장소 받기

팀에서 안내받은 방식대로 저장소를 클론합니다 (예: GitHub 원격 저장소가 있다면).

```bash
git clone <저장소 URL> cj-x-vision
cd cj-x-vision
```

이미 파일을 다른 방식(zip 등)으로 받았다면 해당 폴더로 이동만 하면 됩니다. 이후 모든 명령어는
**이 프로젝트 최상위 폴더(`cj-x-vision`, `docker-compose.yml`이 있는 위치)에서** 실행한다고
가정합니다.

---

## 3. 환경 변수 파일 만들기

이 프로젝트는 Supabase(클라우드 DB/인증/파일저장소)에 연결해서 동작합니다. 연결에 필요한
값들은 보안상 저장소에 커밋되어 있지 않고, 각자 로컬에 파일로 채워 넣어야 합니다.

### 3-1. 예시 파일 복사

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Windows PowerShell을 쓴다면 `cp` 대신 `Copy-Item`을 쓰거나, 파일 탐색기에서 `.env.example`
파일을 복사 → 붙여넣기 → 이름을 `.env`로 바꿔도 됩니다.

### 3-2. 값 채워넣기

방금 만든 `backend/.env`, `frontend/.env.local` 파일을 에디터(VS Code 등)로 열어서
`<...>` 로 표시된 부분을 실제 값으로 바꿉니다. 이 값들은 **팀 내 Supabase 프로젝트 관리자에게
요청**해서 받으세요 (Supabase 대시보드 → 프로젝트 선택 → Project Settings → API 메뉴에서
확인할 수 있는 값들입니다).

`backend/.env`:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_JWT_SECRET=<jwt-secret>
SUPABASE_STORAGE_BUCKET=images
FRONTEND_ORIGIN=https://localhost
```

`frontend/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
NEXT_PUBLIC_API_URL=/api
```

> **주의**: `SUPABASE_SERVICE_ROLE_KEY`는 절대 다른 사람에게 공유하거나 채팅방/공개 저장소에
> 올리면 안 되는 값입니다 (우리 DB 전체에 무제한으로 접근 가능한 키입니다). `.env`,
> `.env.local` 파일은 `.gitignore`에 이미 등록되어 있어서 실수로 git에 커밋되지 않지만,
> 그래도 항상 조심하세요.

---

## 4. 실행하기

프로젝트 최상위 폴더에서 아래 명령 한 줄이면 됩니다.

```bash
docker compose up --build
```

### 무슨 일이 일어나는 건가요?

- `--build`: 최초 실행이거나 코드가 바뀌었을 때, 각 서비스(nginx/frontend/backend)의
  "이미지"를 새로 만듭니다. 이미지는 각 프로그램을 실행하는 데 필요한 모든 것(코드, 실행
  프로그램, 라이브러리)을 담은 상자라고 생각하면 됩니다. **처음 실행할 때는 라이브러리를
  다운로드하느라 몇 분 정도 걸릴 수 있습니다.**
- `up`: 만들어진 이미지로 컨테이너(실제로 실행되는 상자)를 켭니다.
- 터미널에 여러 색의 로그가 계속 흘러나오는데, 이는 nginx/frontend/backend 세 컨테이너의
  로그가 한 화면에 섞여서 나오는 것입니다. 정상입니다.
- 아래와 비슷한 줄이 보이면 정상적으로 켜진 것입니다.
  - `frontend-1  |  ✓ Ready in ...`
  - `backend-1   | INFO:     Application startup complete.`
  - `nginx-1     | ... start worker process ...`

터미널을 닫지 않고 그대로 두면 서버가 계속 실행됩니다. 이 터미널 창은 그대로 두고, **새
터미널 창을 하나 더 열어서** 다른 명령어를 입력하면 됩니다.

백그라운드에서 조용히 실행하고 싶다면(로그가 터미널을 계속 채우는 게 싫다면) `-d`
(detached, "백그라운드로 띄운다"는 뜻) 옵션을 붙이세요.

```bash
docker compose up -d --build
```

---

## 5. 접속 확인하기

브라우저에서 아래 주소로 들어갑니다.

```
https://localhost
```

### "안전하지 않음" / "이 연결은 비공개 정보가 아닙니다" 경고가 뜨는 이유

이 프로젝트는 팀원 각자의 컴퓨터에서 HTTPS로 접속할 수 있도록, nginx가 켜질 때 자동으로
"자체 서명(self-signed) 인증서"라는 것을 로컬에 만듭니다. 실제 서비스에서 쓰는 인증서(공인
기관이 발급)가 아니라 우리가 우리 컴퓨터 안에서 직접 만든 것이라, 브라우저가 "이 인증서를
믿을 수 있는 곳에서 만들었는지 모르겠다"며 경고를 띄우는 것입니다. **개발용 로컬 환경에서는
정상적인 현상이니 당황하지 마세요.**

경고 화면에서 다음과 같이 진행하면 접속됩니다 (최초 1회만 하면 이후에는 다시 안 물어봅니다).

- **Chrome / Edge**: "고급" 클릭 → "localhost(안전하지 않음)로 이동" 클릭
- **Firefox**: "고급" 클릭 → "위험을 감수하고 계속" 클릭

경고 문구 자체를 아예 없애고 싶은 사람은 [README의 HTTPS
섹션](./README.md#https-자체-서명-인증서)에 안내된 mkcert 방법을 참고하세요 (선택 사항).

### 정상 접속 확인 체크리스트

- `https://localhost` → 로그인 화면으로 이동하는 홈 화면이 보이면 프론트엔드 정상
- `https://localhost/login`에서 로그인 시도가 동작하면 Supabase Auth 연결 정상
- `http://localhost:8000/docs` → FastAPI Swagger 문서 페이지가 보이면 백엔드 정상 (이 주소는
  nginx를 거치지 않고 백엔드에 바로 접속하는 주소라 `http`이며 인증서 경고가 없습니다)

---

## 6. 코드를 수정하면 바로 반영되나요?

네. `docker compose up`을 실행하면 `docker-compose.override.yml`이라는 파일이 자동으로 함께
적용되어, 내 컴퓨터의 `frontend/`, `backend/` 폴더가 컨테이너 안에 그대로 연결(마운트)되고
개발 서버 모드로 실행됩니다. 즉:

- `frontend/src/...` 안의 파일을 수정하고 저장하면, 몇 초 안에 브라우저를 새로고침했을 때
  바뀐 내용이 보입니다 (다시 빌드하거나 컨테이너를 재시작할 필요 없음).
- `backend/app/...` 안의 파일을 수정하고 저장하면, 백엔드가 자동으로 재시작되면서 바뀐
  코드가 반영됩니다.

터미널 로그에 `✓ Compiled in ...`(프론트) 나 `Reloading...`(백엔드) 같은 문구가 뜨면 정상
반영된 것입니다.

---

## 7. 자주 쓰는 명령어

프로젝트 최상위 폴더에서 실행합니다.

| 하고 싶은 것 | 명령어 |
| --- | --- |
| 실행 (로그 보면서) | `docker compose up --build` |
| 실행 (백그라운드) | `docker compose up -d --build` |
| 실행 중인 컨테이너 목록 보기 | `docker compose ps` |
| 로그 실시간으로 보기 (백그라운드 실행 중일 때) | `docker compose logs -f` |
| 특정 서비스 로그만 보기 | `docker compose logs -f backend` (frontend/nginx도 가능) |
| 끄기 | `docker compose down` |
| 특정 서비스만 재시작 | `docker compose restart backend` |
| 코드 안 바뀌었는데 이상할 때, 캐시 없이 완전히 새로 빌드 | `docker compose build --no-cache` |
| 컨테이너 안에 직접 들어가보기 (디버깅용) | `docker compose exec backend sh` |

---

## 8. 문제가 생겼을 때 (트러블슈팅)

### "port is already allocated" / 포트가 이미 사용 중이라는 오류

이 프로젝트는 80, 443, 8000, 3000 포트를 사용합니다. 이미 다른 프로그램(다른 프로젝트의
Docker, 사내 사설 서버 등)이 같은 포트를 쓰고 있으면 오류가 납니다.

- 이전에 이 프로젝트를 띄워놓고 끄는 걸 잊었을 가능성이 높습니다 → `docker compose down`
  실행 후 다시 `up` 해보세요.
- 그래도 안 되면 어떤 프로그램이 포트를 쓰고 있는지 확인이 필요합니다 (Windows PowerShell:
  `Get-Process -Id (Get-NetTCPConnection -LocalPort 80).OwningProcess`).

### `docker` 명령을 치면 "Docker Desktop이 실행되고 있지 않습니다" 같은 오류

Docker Desktop 앱이 꺼져 있는 것입니다. Docker Desktop을 실행하고, 고래 아이콘이 "Running"
상태가 될 때까지 기다린 뒤 다시 시도하세요.

### 브라우저에서 계속 예전 화면만 보이고 코드 수정이 반영이 안 될 때

1. 브라우저 강력 새로고침(Ctrl+Shift+R / Cmd+Shift+R)을 먼저 시도하세요.
2. `docker compose logs -f frontend`로 로그를 보면서 파일을 저장해보세요. `Compiling...`
   같은 로그가 아예 안 뜬다면 컨테이너가 파일 변경을 감지하지 못하는 상태이니
   `docker compose restart frontend`로 재시작해보세요.

### `.env` 값을 잘못 넣었거나 바꿨는데 반영이 안 될 때

환경변수 파일은 컨테이너가 **처음 켜질 때** 읽습니다. `.env`/`.env.local`을 수정했다면
아래처럼 재시작해야 반영됩니다.

```bash
docker compose down
docker compose up --build
```

### 완전히 초기화하고 처음부터 다시 하고 싶을 때

```bash
docker compose down
docker system prune -f          # 사용하지 않는 Docker 이미지/캐시 정리 (선택)
docker compose up --build
```

인증서까지 새로 만들고 싶다면 `nginx/certs/localhost.crt`, `nginx/certs/localhost.key` 두
파일을 삭제하고 다시 `up` 하세요.

### 그래도 해결이 안 될 때

`docker compose logs`의 오류 메시지 전체를 복사해서 팀 채널에 공유해주세요. 대부분의 문제는
로그 메시지 안에 원인이 그대로 적혀 있습니다.

---

## 9. 더 자세한 내용

프로젝트 구조, 기술 스택, HTTPS 인증서 원리, Docker 없이 각자 로컬에서 실행하는 방법 등
개발자용 상세 문서는 [README.md](./README.md)를 참고하세요.
