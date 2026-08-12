# cj-x-vision

차량 / 파손이력 / 사용자 관리 시스템 보일러플레이트.

## 기술 스택

| 영역          | 기술                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| 리버스 프록시 | Nginx                                                                                    |
| 프론트엔드    | Next.js (React) + TailwindCSS                                                            |
| 백엔드        | Python FastAPI (RESTful API)                                                             |
| DB            | Supabase (PostgreSQL)                                                                    |
| 파일 저장소   | Supabase Storage (이미지)                                                                |
| 인증          | Supabase Auth                                                                            |
| 배포          | Docker Compose (Nginx + Next.js + FastAPI 컨테이너화, Supabase는 클라우드 매니지드 사용) |

Supabase는 클라우드에 이미 생성된 프로젝트에 연결하는 방식입니다 (로컬 Supabase 컨테이너 없음).

## 요청 흐름

```
브라우저 → Nginx(:80 → 301 리다이렉트, :443 HTTPS) ┬─ "/"       → frontend (Next.js, :3000)
                                                    └─ "/api/*" → backend  (FastAPI, :8000)
```

프론트엔드는 Supabase Auth로 직접 로그인하고, 이후 백엔드를 호출할 때는 발급받은 access token을
`Authorization: Bearer <token>` 헤더로 실어 보냅니다. 백엔드는 `SUPABASE_JWT_SECRET`으로 토큰을
검증합니다(`app/core/security.py`). DB/Storage 접근은 백엔드가 `service_role` 키로 수행합니다.

## 사전 준비

1. [supabase.com](https://supabase.com)에서 프로젝트를 하나 생성합니다.
2. Project Settings → API에서 다음 값을 확인합니다: Project URL, `anon` public key, `service_role` key, JWT Secret.
3. Storage에서 이미지 업로드용 버킷을 하나 만듭니다 (기본값: `images`).

## 로컬 실행 (Docker Compose)

```bash
cp backend/.env.example backend/.env          # Supabase 값 채우기
cp frontend/.env.local.example frontend/.env.local  # Supabase 값 채우기

docker compose up --build
```

- 앱: https://localhost (http://localhost은 자동으로 https로 리다이렉트됩니다)
- API 문서(Swagger): http://localhost:8000/docs

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
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000
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
├── docker-compose.override.yml # 로컬 개발용: 소스 볼륨 마운트 + 핫리로드 (자동 적용)
├── nginx/
│   └── nginx.conf          # "/api/*" → backend, 나머지 → frontend
├── backend/                # FastAPI
│   └── app/
│       ├── main.py
│       ├── core/           # 설정, Supabase 클라이언트, Auth 검증
│       └── api/routes/     # health, me(인증 예시), storage(이미지 업로드 예시)
└── frontend/                # Next.js + Tailwind
    └── src/
        ├── app/             # App Router 페이지 (/, /login, /dashboard)
        ├── lib/supabase/    # 브라우저/서버 Supabase 클라이언트
        ├── lib/api.ts       # 백엔드 호출 헬퍼(토큰 자동 첨부)
        └── middleware.ts    # 세션 갱신 + /dashboard 보호
```

## 현재 범위

이 저장소는 뼈대(보일러플레이트)만 포함합니다: Nginx 리버스 프록시, 로그인/대시보드 예시 페이지,
Supabase Auth 토큰을 검증하는 백엔드 예시 라우트(`/me`), 이미지 업로드 예시 라우트(`/storage/upload`).
차량(vehicles), 파손이력(damage_history) 등 실제 도메인 테이블/스키마와 CRUD API는 아직 없으므로
필요에 따라 `backend/app/api/routes/`, `backend/app/models/`와 Supabase 테이블을 추가하면 됩니다.
