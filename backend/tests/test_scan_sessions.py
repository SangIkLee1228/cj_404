from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import recognition

client = TestClient(app)


def test_create_scan_session_requires_auth():
    payload = {"store_id": 1, "staff_id": 1, "image_url": "scan/2026-08-20/tray.jpg"}
    response = client.post("/api/scan-sessions", json=payload)
    assert response.status_code == 401


def test_recognize_requires_auth():
    response = client.post("/api/scan-sessions/1/recognize")
    assert response.status_code == 401


# ── 데모 이미지 선택 (카메라 없는 시연 흐름) ────────────────────────────────
#
# 사진 목록을 .env에 박아두지 않고 Storage 버킷 루트를 매번 조회한다. 아래 테스트는
# "무엇을 목록에 넣지 않는가"와 "목록 순서가 흔들리지 않는가"를 잡는다 - 둘 다
# 틀리면 시연 중에 엉뚱한 사진이 나오는데 화면만 봐서는 원인을 알 수 없다.


class _FakeBucket:
    def __init__(self, entries):
        self._entries = entries
        self.signed = []

    def list(self, path, options=None):
        return self._entries

    def create_signed_url(self, path, expires_in):
        self.signed.append(path)
        return {"signedURL": f"https://signed.example/{path}"}


class _FakeStorage:
    def __init__(self, bucket):
        self._bucket = bucket
        self.requested = []

    def from_(self, name):
        self.requested.append(name)
        return self._bucket


def _file(name):
    return {"name": name, "id": f"id-{name}"}


def _folder(name):
    """Storage는 하위 폴더를 id가 없는 항목으로 돌려준다."""
    return {"name": name, "id": None}


def _use_bucket(monkeypatch, entries, bucket_name="test"):
    bucket = _FakeBucket(entries)
    storage = _FakeStorage(bucket)
    monkeypatch.setattr(
        recognition, "get_supabase", lambda: SimpleNamespace(storage=storage)
    )
    monkeypatch.setattr(
        recognition,
        "get_settings",
        lambda: SimpleNamespace(demo_scan_image_bucket=bucket_name),
    )
    return bucket


def test_demo_list_skips_folders_and_non_images(monkeypatch):
    """루트만 쓴다. 하위 폴더(원본 보관용)가 시연 사진에 섞이면 안 된다."""
    _use_bucket(
        monkeypatch,
        [
            _file("IMG_7176.jpg"),
            _folder("original"),
            _file(".emptyFolderPlaceholder"),
            _file("classes.txt"),
            _file("IMG_4423.JPG"),
        ],
    )

    assert recognition._demo_image_paths("test") == ["IMG_4423.JPG", "IMG_7176.jpg"]


def test_demo_list_is_sorted_regardless_of_storage_order(monkeypatch):
    """사진 선택이 len(목록)에 대한 나머지 연산이라 순서가 흔들리면 결과가 바뀐다."""
    _use_bucket(monkeypatch, [_file("c.jpg"), _file("a.jpg"), _file("b.jpg")])

    assert recognition._demo_image_paths("test") == ["a.jpg", "b.jpg", "c.jpg"]


def test_same_order_gets_the_same_photo(monkeypatch):
    """다시 촬영은 같은 트레이를 다시 찍는 동작이다 - 빵이 바뀌면 시연이 말이 안 된다."""
    bucket = _use_bucket(
        monkeypatch, [_file("a.jpg"), _file("b.jpg"), _file("c.jpg")]
    )
    session = {"image_url": None, "order_id": 7, "scan_session_id": 1}

    first = recognition.resolve_image_url(session)
    second = recognition.resolve_image_url({**session, "scan_session_id": 99})

    assert first == second
    assert bucket.signed == ["b.jpg", "b.jpg"]   # 7 % 3


def test_empty_bucket_fails_loudly(monkeypatch):
    """조용히 넘어가면 "왜 인식이 안 되지"를 화면만 보고 알 수 없다."""
    _use_bucket(monkeypatch, [_folder("original")])

    with pytest.raises(recognition.RecognitionError) as exc:
        recognition.resolve_image_url({"image_url": None, "order_id": 1})

    assert exc.value.reason == "NO_IMAGE"


def test_unset_bucket_fails_without_calling_storage(monkeypatch):
    _use_bucket(monkeypatch, [_file("a.jpg")], bucket_name="")

    with pytest.raises(recognition.RecognitionError) as exc:
        recognition.resolve_image_url({"image_url": None, "order_id": 1})

    assert exc.value.reason == "NO_IMAGE"
