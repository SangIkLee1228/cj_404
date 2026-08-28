# 모델 개발환경 가이드

이 레포는 모델 학습·추론 코드를 개발하고, 이를 **추론 컨테이너로 빌드**하기 위한 저장소입니다.

- 평소 작업은 `master` 브랜치에서 하고, 빌드가 필요할 때만 `model/ci` 브랜치로 푸시합니다.
- 커밋·푸시는 **개발환경 안에서 본인 계정으로** 합니다. 커밋한 계정 정보로 개발환경을 찾아 빌드하므로, 로컬 PC나 다른 계정으로 푸시하면 빌드가 실패할 수 있습니다.

## 1. 폴더 구조

```
src/
├── api/                  # 추론 컨테이너의 빌드 설정
│   ├── Dockerfile        #   베이스 이미지·시스템 패키지 정의
│   ├── requirements.txt  #   파이썬 패키지 종속성
│   └── user-values.yaml  #   빌드 메타정보 (3장 참고)
└── core/                 # 실제 모델 학습·추론 코드
    ├── predict_module.py #   추론 진입점 (init / predict)
    ├── test_inference.py #   추론 로컬 테스트 스크립트
    └── models/           #   모델 파일 보관 위치 (git에는 올라가지 않음)
```

## 2. 단계별 사용법

### ① 추론 코드 작성 — `src/core/predict_module.py`

- `init()` — 컨테이너 시작 시 1회 실행됩니다. 모델 로드 등 초기화 코드를 작성합니다.
- `predict(message, ...)` — 요청마다 실행되는 실제 추론 로직입니다. `message`(dict)가 입력이며, 결과를 dict로 반환합니다.
- 배치 처리 경로(`use_batch_job`)도 템플릿에 포함되어 있으나, 기본 사용은 동기 추론입니다.

### ② 패키지 추가 — `src/api/requirements.txt`

- 추론에 필요한 파이썬 패키지를 파일 **하단**에 추가합니다.
- 상단의 시스템 라이브러리(fastapi, uvicorn, redis, psycopg2-binary)는 삭제하지 않습니다.
- pip 외의 시스템 패키지가 필요하면 `src/api/Dockerfile`의 apt 영역에 추가합니다 (4장 참고).

### ③ 로컬 테스트 — `src/core/test_inference.py`

```bash
cd src/core
python test_inference.py
```

- `input_message`를 실제 요청 입력 구조에 맞게 수정한 뒤 실행하여, `init → predict` 흐름이 정상 동작하는지 확인합니다.

### ④ 모델 파일 준비 — `copy_folder_list`

- 모델 가중치 등 대용량 파일은 git에 올리지 않습니다 (`.gitignore`가 `models/`, `checkpoints/`, `*.pt` 등을 제외시킴).
- 대신 `src/api/user-values.yaml`의 `copy_folder_list`에 해당 폴더 경로를 적어두면, 빌드 파이프라인이 동작하면서 해당 경로를 복제하여 버저닝합니다.
- 단, 비어있는 폴더는 무시되고 최소 한 개 이상의 파일을 포함한 경우에만 복제합니다.

### ⑤ 빌드 전 점검

- `src/api/user-values.yaml` — `modelDesc`, `aim_id`, `copy_folder_list` 확인 (3장)
- `src/api/Dockerfile` — 베이스 이미지, 시스템 패키지 확인 (4장)

### ⑥ 빌드 실행

```bash
git add -A && git commit -m "..."   # 평소처럼 master에 커밋
git push origin master              # 작업 저장 (빌드는 실행되지 않음)
git push origin master:model/ci     # ★ 빌드 실행
```

- `model/ci` 브랜치는 처음에는 레포에 없어도 됩니다 — 위 push 명령이 처음 실행될 때 원격에 자동 생성되며, 로컬에 만들거나 체크아웃할 필요가 없습니다.
- `model/ci` 브랜치로 푸시하면 파이프라인이 **푸시된 커밋 그대로** 컨테이너 이미지 빌드와 모델 버전 등록을 자동으로 수행합니다.
- 진행 상태는 GitLab 파이프라인 화면에서, 결과는 플랫폼의 모델 목록에서 확인합니다.
- 푸시할 때마다 새 모델 버전이 만들어집니다 (빌드가 실패해도 버전 번호는 소비됩니다).

## 3. user-values.yaml 항목 설명

| 항목 | 설명 |
|------|------|
| `modelDesc` | 이 빌드 버전에 대한 설명. 플랫폼 모델 목록에 표시됩니다. |
| `aim_id` | 빌드 버전과 연동해 저장할 학습(실험) 버전 ID. 없으면 비워둡니다. |
| `copy_folder_list` | 빌드 결과에 포함할 폴더 목록. **개발환경 기준 절대 경로**(`/home/jovyan/...`)로 작성합니다. 목록에 있지만 실제로 없는 폴더는 무시됩니다. |
| `model.*` | 추론 진입점 매핑 — 진입 파일 경로·파일명과 `init`/`predict` 함수명. 시스템이 추론 코드를 찾는 기준이므로 **수정하지 않습니다.** 잘못 수정하면 빌드는 성공해도 배포·추론 시점에 실패합니다. |

> 파일 위치와 이름(`src/api/user-values.yaml`)은 변경하면 안 됩니다.

## 4. Dockerfile 작성 시 알아둘 것

- 베이스 이미지는 필요 시 변경할 수 있습니다 (예: GPU가 필요하면 CUDA 이미지).
- `WORKDIR`, `PYTHONPATH` 등 기본 설정은 유지합니다.
- 이미지는 **`src/api/` 폴더만으로** 빌드됩니다. `COPY`는 `src/api` 안의 파일만 가능하며, `src/core/`의 코드와 모델 파일은 빌드 과정에서 자동으로 포함되므로 `COPY`할 필요가 없습니다.
- 시스템 패키지는 apt 영역에, 파이썬 패키지는 `requirements.txt`에 추가합니다.

## 5. 주의사항 요약

| 하지 말 것 | 이유 |
|------------|------|
| 개발환경 밖(로컬 PC)이나 다른 계정으로 커밋·푸시 | 커밋 계정으로 개발환경을 찾지 못해 빌드 실패 |
| `src/api/`에 `main.py`, `utils.py`, `error_code.py` 파일 생성 | 시스템 예약 파일명과 충돌해 빌드 실패 |
| `user-values.yaml` 위치·이름 변경, `model.*` 블록 수정 | 빌드 또는 배포·추론 실패 |
| `copy_folder_list`에 `/home/jovyan` 밖의 경로 사용 | 빌드 즉시 실패 |
| `requirements.txt` 상단의 시스템 라이브러리 삭제 | 추론 서버 기동 실패 |
