# ✅ GPU 서빙용 베이스 - onnxruntime-gpu 1.23.x 는 CUDA 12.x + cuDNN 9 을 요구한다.
#    -runtime (추론 전용, nvcc/헤더 제외) 로 슬림화. onnxruntime-gpu 의 CUDAExecutionProvider 는
#    이 이미지의 libcudart / libcublas / libcudnn 만으로 동작한다.
#    (기존 base/python:3.11 은 CPU 전용이라 CUDAExecutionProvider 로드가 실패한다)
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

# ✅ 빌드에 사용할 환경설정 값을 주입 및 설정합니다
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    LANG=ko_KR.UTF-8 \
    LANGUAGE=ko_KR:ko \
    LC_ALL=ko_KR.UTF-8 \
    PYTHONPATH=/root/src/core

# ✅ /app을 작업 디렉토리로 설정합니다. 시스템 코드의 정상적인 동작을 위해서 가급적 변경하지 않습니다.
WORKDIR /app

# ✅ 시스템 패키지 (런타임 필수만)
#    - python3(3.10, Ubuntu 22.04 기본) + pip + python-is-python3 (system 코드가 `python` 호출)
#    - libgl1 / libglib2.0-0 : opencv-python-headless / ultralytics 런타임 so
#    - libgomp1              : onnxruntime / numpy OpenMP 런타임
#    - locales               : ko_KR.UTF-8 (LC_ALL 경고 방지)
RUN rm -rf /var/lib/apt/lists/* && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 python3-pip python-is-python3 \
        ca-certificates locales libgl1 libglib2.0-0 libgomp1 && \
    sed -i 's/^# *\(ko_KR.UTF-8\)/\1/' /etc/locale.gen && locale-gen && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# ✅ 설치할 파이썬 패키지는 requirements.txt 에 추가합니다
#    torch / torchvision 은 CPU 휠로 설치한다 - 실제 추론은 onnxruntime-gpu 가 GPU 로 수행하고,
#    torch 는 ultralytics 후처리에서만 import 되므로 CUDA 빌드가 불필요하다 (이미지 ~2GB 절감).
COPY requirements.txt requirements.txt
RUN python3 -m pip install --upgrade pip && \
    python3 -m pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision && \
    python3 -m pip install -r requirements.txt && \
    find /usr/local/lib/python3* -name '__pycache__' -type d -prune -exec rm -rf {} + || true

CMD ["/bin/sh -c", "sleep infinity"]
