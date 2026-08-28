from pathlib import Path

from inference_service import TEMP_INPUT_DIR, download_image
from predict_module import init, predict

########
# 1. 본 파일은 입력 데이터에 따른 예상 실행 결과를 테스트해보기 위한 파일입니다.
# 2. 기대하는 입력 구조에 맞게 데이터를 작성합니다.
# 3. python test_inference.py 명령어로 파이썬 파일을 실행하여 추론 동작 결과를 확인할 수 있습니다.
#
# 이미지 다운로드는 inference_service.download_image 가 담당한다. 여기서는 먼저 내려받아
# message["image_path"]를 넘기지만, image_path 없이 image_url 만 넘겨도 predict()가 직접 내려받는다
# (배포본 OneFlowAI 경로와 동일).
image_url = "https://aywnlwqnjgvtcnxwuoxc.supabase.co/storage/v1/object/sign/test/IMG_7176.jpg?token=eyJraWQiOiJkYTJlZmEyZC0yOTFhLTQ3NGMtOWYwZi03MzgwNTYwYmY4MmUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZXN0L0lNR183MTc2LmpwZyIsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3ODc3MzkxNTcsImV4cCI6MTc4ODM0Mzk1N30.5IR5Ozt66kcu2vA7uXevC4XeYzhoyaA40CGlmEftGo8"
########

init()

TEMP_INPUT_DIR.mkdir(parents=True, exist_ok=True)
input_path = TEMP_INPUT_DIR / "0001.jpg"
download_image(image_url, input_path)

input_message = {
    "image_url": image_url,
    "image_path": str(input_path),
    "use_batch_job": False,
}

response = predict(
    message=input_message, uuid_id="0001", is_async_mode="false", x_api_key="key"
)

print(response)
