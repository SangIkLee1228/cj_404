import json
import os
import sys
import traceback
from pathlib import Path

import numpy as np
from PIL import Image
from ultralytics import YOLO

#from oneflowai import handler, minio_client, postgres, utils
#from oneflowai.fptr_util import send_notification
#from oneflowai.orchestrator import generate_job

from inference_service import (
    TEMP_INPUT_DIR,
    TEMP_OUTPUT_DIR,
    ImageDownloadError,
    attach_product_ids,
    download_image,
    sweep_temp_files,
)

BASE_DIR = Path(__file__).parent
MODEL_DIR = BASE_DIR / "models"
MODEL_GLOB = "*.onnx"  # 모델 파일명이 바뀌어도 되도록 확장자로만 매칭

CONF_THRESHOLD = 0.25

_model = None  # init()에서 로드하고 predict()에서 재사용


def _resolve_model_path() -> Path:
    """MODEL_DIR 안의 *.onnx 파일을 찾아 경로를 반환한다.

    - 없으면 명확한 에러를 던진다.
    - 여러 개면 이름순 첫 번째를 쓰고 경고를 출력한다.
    """
    candidates = sorted(MODEL_DIR.glob(MODEL_GLOB))
    if not candidates:
        raise FileNotFoundError(f"{MODEL_DIR} 에서 '{MODEL_GLOB}' 모델 파일을 찾을 수 없습니다.")
    if len(candidates) > 1:
        names = ", ".join(p.name for p in candidates)
        print(f"[!] onnx 모델이 여러 개입니다({names}). 첫 번째 '{candidates[0].name}'를 사용합니다.")
    return candidates[0]


def init():
    """
    모델 로드를 비롯한 모듈 초기화 작업을 수행합니다.
    """
    global _model
    try:
        print("모듈 초기화 함수가 실행되었습니다.")
        TEMP_INPUT_DIR.mkdir(parents=True, exist_ok=True)
        TEMP_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        sweep_temp_files()  # 이전 실행에서 남은 임시파일 정리

        model_path = _resolve_model_path()

        # ONNX Runtime(CUDA EP)으로 로드 - PyTorch(.pt) 대비 추론속도 약 18% 개선 확인됨
        _model = YOLO(str(model_path))

        # 예열(warmup): ONNX Runtime의 CUDA 실행 그래프 초기화 비용(약 5초)은 첫 predict() 호출 시
        # 지연 발생하므로, 컨테이너 기동 시점(init)에 더미 이미지로 미리 소진시켜 실제 유저 요청에
        # 영향이 없도록 한다.
        dummy_image = np.zeros((640, 640, 3), dtype=np.uint8)
        _model.predict(dummy_image, verbose=False)
        print(f"모델 로드 및 예열 완료: {model_path}")

    except Exception as e:
        print("모듈 초기화 중 에러가 발생하였습니다.")
        print(str(e))
        traceback.print_exc()
        sys.exit(1)


def predict(
    message: dict,
    uuid_id: str,
    is_async_mode: str = "false",
    x_api_key: str = "",
    is_stream: str = "",
) -> dict:
    """
    주어진 메시지를 기반으로 예측이나 메세지에 대한 처리를 수행합니다.
    결과는 dictionary 형태로 반환하는 것을 권장합니다.

    - use_batch_job=True  : 배치 잡 등록만 수행한다.
    - use_batch_job=False : message["image_path"](미리 다운로드된 로컬 파일)가 있으면 그대로,
      없으면 message["image_url"]을 직접 내려받아 추론한다. 결과 detection에는
      상품 ID("id")가 주입된 상태로 반환된다. (배포본 OneFlowAI 진입점)
    """
    print("예측 함수가 실행되었습니다.")
    message["uuid"] = uuid_id
    async_mode = True if is_async_mode == "true" else False

    if message.get("use_batch_job", False):  # 페이로드에 정의함(없으면 동기 추론)
        env = "vfx"
        valkey_stream_key = os.getenv("VALKEY_STREAM_KEY")

        job_info = generate_job(
            env=env,
            payload=message,
            valkey_stream_key=valkey_stream_key,
            extra_values=[{"name": "ASYNC_MODE", "value": is_async_mode}],
        )  # minio 파일 저장, job 등록

        return {
            "status": 200,
            "message": f"UUID {uuid_id} job registered",
            "job_info": job_info,
        }
    else:
        # TLJ 빵 인식: image_path(미리 다운로드됨) 또는 image_url -> ONNX 추론 -> YOLO 형태 JSON 반환
        #
        # - api_server / test_inference: 호출 측이 이미지를 내려받아 message["image_path"]로 넘긴다.
        # - 배포본(OneFlowAI): api_server가 없으므로 message["image_url"]만 오고,
        #   여기서 inference_service.download_image로 직접 내려받아 자기완결형으로 처리한다.
        image_path = message.get("image_path")
        if not image_path:
            image_url = message.get("image_url")
            if not image_url:
                return {
                    "status": 400,
                    "message": f"UUID {uuid_id} job failed: image_path/image_url 둘 다 없음",
                    "data": None,
                }
            try:
                image_path = download_image(image_url, TEMP_INPUT_DIR / f"{uuid_id}.jpg")
            except ImageDownloadError as e:
                print(f"[-] Error in predict (download): {str(e)}")
                return {
                    "status": 502,
                    "message": f"UUID {uuid_id} job failed: {str(e)}",
                    "data": None,
                }

        try:
            image_path = Path(image_path)

            image = Image.open(image_path).convert("RGB")
            result = _model.predict(image, conf=CONF_THRESHOLD, verbose=False)[0]

            detections = [
                {
                    "label": _model.names[int(box.cls.item())],
                    "confidence": float(box.conf.item()),
                    "bbox": [float(v) for v in box.xyxy[0].tolist()],  # [x1, y1, x2, y2], 원본 이미지 픽셀 좌표
                }
                for box in result.boxes
            ]

            output_data = {
                "image_url": message.get("image_url"),
                "width": image.width,
                "height": image.height,
                "detections": detections,
            }

            result = {
                "status": 200,
                "message": f"UUID {uuid_id} job is succeded",
                "data": output_data,
            }
            # 각 detection에 label 기준 상품 ID("id")를 주입 (배포본·로컬 공통).
            # JSON 저장 전에 적용해야 저장 파일에도 "id"가 포함된다.
            result = attach_product_ids(result)

            output_path = TEMP_OUTPUT_DIR / f"{uuid_id}.json"
            output_path.write_text(
                json.dumps(result["data"], ensure_ascii=False, indent=2)
            )

            return result

        except Exception as e:
            print(f"[-] Error in predict: {str(e)}")
            traceback.print_exc()
            return {
                "status": 500,
                "message": f"UUID {uuid_id} job failed: {str(e)}",
                "data": None,
            }


####################
# if use_batch_job #
####################


def run_job(env: str = "vfx") -> dict:
    """
    배치 작업이 실제 수행하는 함수입니다.
    '''if __name__=="__main__":'''
    하위에서 불러 사용하는 함수입니다.
    """
    try:
        batch_req_id = os.getenv("BATCH_REQ_ID")
        pod = os.getenv("POD_NAME")

        req_data = postgres.select_row(
            "model.md_svc_batch_req_history",
            ["batch_req_data_url"],
            {"batch_req_id": batch_req_id},
            env=env,
        )

        # MinIO에서 요청 Payload JSON 파일 다운로드
        data_url = req_data["batch_req_data_url"]
        path = data_url.replace("s3://", "", 1)
        bucket, key = path.split("/", 1)

        downloaded_payload = minio_client.download_dict(object_name=key, bucket=bucket)
        uuid = downloaded_payload["uuid"]

        ##################################################################################
        # 실제 수행 함수 호출 (예시))
        # pipeline 실행부 코드 작성 & Payload 사용하여 처리
        async_mode = (
            True if os.getenv("ASYNC_MODE") == "true" else False
        )  # 비동기 요청(처리 시간 길 경우) 시 true, 동기 요청 시 false
        results = handler.send_request(
            api_key="", data=downloaded_payload, async_mode=async_mode
        )
        ##################################################################################
        ##################################################################################
        # 비동기 요청하는 경우에 아래 로직 추가 사용 (async_mode == "true")
        # handler 내 각 요청 마다 추가 해주어야 함
        ##################################################################################
        if async_mode:
            try:
                # Valkey에서 결과가 나올 때까지 대기
                result_key = results["data"]["result_key"]
                final_result = utils.wait_for_result_key(
                    result_key=result_key,
                )
                results = final_result
            except Exception as e:
                print(f"[-] Error in model handler process: {str(e)}")
                traceback.print_exc()
                results = None
        ##################################################################################

        # ✅ 성공 상태 업데이트
        postgres.update_row(
            "model.md_svc_batch_req_history",
            {
                "batch_req_status": "COMPLETED",
                "batch_req_run_pod_nm": pod,
                "batch_req_run_stts": results["status"],
            },
            {"batch_req_id": batch_req_id},
            env=env,
        )

        # # Job 결과 알림
        # send_notification(
        #     project_name=downloaded_payload["project_name"] if "project_name" in downloaded_payload else "",
        #     uuid=uuid,
        #     task_status=results["status"],
        #     save_path=downloaded_payload["save_path"] if "save_path" in downloaded_payload else None,
        #     tag_id=downloaded_payload["tag_id"] if "tag_id" in downloaded_payload else None,
        #     task_id=downloaded_payload["task_id"] if "task_id" in downloaded_payload else None,
        # )

        return {
            "status": 200,
            "message": f"UUID {uuid} Batch job completed successfully: Status {results['status']}",
            "data": results["data"],
        }

    except Exception as e:
        print(f"[-] Error in batch job process: {str(e)}")
        traceback.print_exc()

        batch_req_id = os.getenv("BATCH_REQ_ID")
        if batch_req_id:
            postgres.update_row(
                "model.md_svc_batch_req_history",
                {"batch_req_status": "FAILED", "batch_req_run_pod_nm": pod},
                {"batch_req_id": batch_req_id},
                env=env,
            )

        # # Job 실패 결과 알림
        # send_notification(
        #     project_name=downloaded_payload["project_name"] if "project_name" in downloaded_payload else "",
        #     uuid=uuid,
        #     task_status="FAILED",
        #     save_path=downloaded_payload["save_path"] if "save_path" in downloaded_payload else None,
        #     tag_id=downloaded_payload["tag_id"] if "tag_id" in downloaded_payload else None,
        #     task_id=downloaded_payload["task_id"] if "task_id" in downloaded_payload else None,
        # )

        return {
            "status": 500,
            "message": f"UUID {uuid} Batch job failed: {str(e)}",
            "data": None,
        }


if __name__ == "__main__":
    # 모듈 초기화
    init()

    # run_job 함수 실행
    result = run_job()

    # 결과 출력 및 적절한 종료 코드 설정
    if result and result.get("status") == 200:
        print("✅ Batch job completed successfully")
        print(result.get("data"))
        sys.exit(0)  # 성공적으로 종료
    else:
        print("❌ Batch job failed")
        print(
            f"Error: {result.get('message', 'Unknown error') if result else 'No result returned'}"
        )
        sys.exit(1)  # 실패로 종료
