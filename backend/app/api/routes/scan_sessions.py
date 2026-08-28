"""트레이 촬영·인식 API (FR-01/02/03/10, API명세서 v1.2 · 4.4).

세션은 주문에 1:N으로 붙는다(SCAN_SESSION.order_id). 한 번의 계산에
기본 촬영(BASIC) + 추가 촬영(ADD) + 재촬영(RETAKE)이 여러 건 생길 수 있기 때문이다.

용어: 화면에는 "촬영"으로 표기한다. "스캔"은 금어(API명세서 6장).
"""

import time
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import get_settings
from app.core.deps import StaffContext, get_staff_context
from app.core.supabase_client import get_supabase
from app.schemas.scan import (
    ScanCancelResponse,
    ScanDiscardResponse,
    ScanSessionCreate,
    ScanSessionCreated,
    ScanSessionDetail,
)
from app.services.orders import Amounts, add_quantities, load_store_prices, recalculate
from app.services.recognition import (
    RecognitionError,
    call_detect,
    resolve_image_url,
    sign,
    to_detected_rows,
)

router = APIRouter(prefix="/scan-sessions", tags=["scan"])
logger = structlog.get_logger("app.scan")


def _load_session(scan_session_id: int, staff: StaffContext) -> dict:
    """세션을 읽되, 남의 매장 세션이면 404로 막는다.

    store_id 조건을 빼먹으면 세션 ID만 바꿔가며 다른 매장의 촬영 기록을
    조회·조작할 수 있다. 조회 시점에 한 번 걸러두는 편이 안전하다.
    """
    supabase = get_supabase()
    result = (
        supabase.table("scan_session")
        .select("*")
        .eq("scan_session_id", scan_session_id)
        .eq("store_id", staff.store_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "촬영 세션을 찾을 수 없습니다")
    return result.data[0]


def _order_summary(order_id: int | None) -> dict | None:
    if order_id is None:
        return None
    supabase = get_supabase()
    order = (
        supabase.table("orders")
        .select("gross_amount, total_amount")
        .eq("order_id", order_id)
        .limit(1)
        .execute()
    )
    if not order.data:
        return None
    items = (
        supabase.table("order_item")
        .select("quantity")
        .eq("order_id", order_id)
        .execute()
    )
    row = order.data[0]
    return {
        "gross_amount": int(round(float(row["gross_amount"]))),
        "total_amount": int(round(float(row["total_amount"]))),
        "item_count": sum(i["quantity"] for i in items.data),
    }


def _signed_image(session: dict) -> str | None:
    """세션 이미지의 서명 URL. 실패해도 None만 주고 넘어간다.

    사진 한 장 못 띄우는 것과 세션 조회가 통째로 500이 되는 것은 심각도가 다르다.
    """
    path = session.get("image_url")
    if not path:
        return None
    try:
        return sign(path)
    except Exception:  # noqa: BLE001
        logger.warning("scan.sign_failed", path=path, exc_info=True)
        return None


def _session_detail(session: dict, image_url: str | None = None) -> dict:
    """세션 + 인식 항목. GET /{id} 와 recognize 응답이 같은 모양이다.

    image_url을 넘기면 그것을 그대로 쓴다 — recognize는 시연용 대체 이미지를
    추론했을 수 있고, 그때는 session.image_url(NULL)이 아니라 실제로 추론한
    사진을 화면에 띄워야 bbox 위치가 맞는다.
    """
    supabase = get_supabase()
    detected = (
        supabase.table("detected_item")
        .select("detected_item_id, product_id, ai_class_label, confidence,"
                " bbox_x, bbox_y, bbox_w, bbox_h, quantity, is_below_threshold,"
                " product(product_name)")
        .eq("scan_session_id", session["scan_session_id"])
        .order("detected_item_id")
        .execute()
    )

    items = []
    for d in detected.data:
        product = d.get("product") or {}
        if isinstance(product, list):
            product = product[0] if product else {}
        items.append(
            {
                "detected_item_id": d["detected_item_id"],
                "product_id": d["product_id"],
                "product_name": product.get("product_name"),
                "ai_class_label": d["ai_class_label"],
                "confidence": float(d["confidence"]),
                "quantity": d["quantity"],
                "is_below_threshold": d["is_below_threshold"],
                "bbox": {
                    "x": float(d["bbox_x"]) if d["bbox_x"] is not None else None,
                    "y": float(d["bbox_y"]) if d["bbox_y"] is not None else None,
                    "w": float(d["bbox_w"]) if d["bbox_w"] is not None else None,
                    "h": float(d["bbox_h"]) if d["bbox_h"] is not None else None,
                },
            }
        )

    return {
        "scan_session_id": session["scan_session_id"],
        "order_id": session["order_id"],
        "image_url": image_url if image_url is not None else _signed_image(session),
        "capture_type": session["capture_type"],
        "status": session["status"],
        "overlap_warning": session["overlap_warning"],
        "recognition_ms": session["recognition_ms"],
        "failure_reason": session["failure_reason"],
        "started_at": session["started_at"],
        "completed_at": session["completed_at"],
        "detected_items": items,
        "order_summary": _order_summary(session["order_id"]),
    }


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ScanSessionCreated)
def create_scan_session(
    payload: ScanSessionCreate, staff: StaffContext = Depends(get_staff_context)
):
    """촬영 세션 생성 (FR-01). status='CAPTURED'로 1행 만든다.

    store_id·staff_id는 요청 바디가 아니라 인증 컨텍스트에서 온다(API명세서 1.1).
    """
    supabase = get_supabase()

    order = (
        supabase.table("orders")
        .select("order_id, status")
        .eq("order_id", payload.order_id)
        .eq("store_id", staff.store_id)
        .limit(1)
        .execute()
    )
    if not order.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "주문을 찾을 수 없습니다")
    if order.data[0]["status"] != "PENDING":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "이미 처리된 주문에는 촬영을 추가할 수 없습니다"
        )

    result = (
        supabase.table("scan_session")
        .insert(
            {
                "store_id": staff.store_id,
                "staff_id": staff.staff_id,
                "order_id": payload.order_id,
                "capture_type": payload.capture_type,
                "image_url": payload.image_path,  # DB 컬럼명은 image_url
                "overlap_warning": payload.overlap_warning,
                "status": "CAPTURED",
            }
        )
        .execute()
    )
    session = result.data[0]

    structlog.contextvars.bind_contextvars(
        scan_session_id=session["scan_session_id"],
        store_id=staff.store_id,
        staff_id=staff.staff_id,
    )
    logger.info(
        "scan.captured",
        order_id=payload.order_id,
        capture_type=payload.capture_type,
        overlap_warning=payload.overlap_warning,
    )
    return {
        "scan_session_id": session["scan_session_id"],
        "order_id": session["order_id"],
        "capture_type": session["capture_type"],
        "status": session["status"],
        "started_at": session["started_at"],
    }


@router.get("/{scan_session_id}", response_model=ScanSessionDetail)
def get_scan_session(scan_session_id: int, staff: StaffContext = Depends(get_staff_context)):
    """세션 상세 + 인식 항목 (FR-02)."""
    return _session_detail(_load_session(scan_session_id, staff))


def _known_product_ids(detections: list[dict]) -> set[int]:
    """모델이 준 id 중 실제로 우리 product 테이블에 있는 것만 추린다.

    모델이 상품 매핑까지 끝내서 보내주지만, 상품이 지워지거나 모델 쪽 매핑표가
    낡으면 없는 id가 섞여 들어온다. 그대로 넣으면 FK 위반으로 인식 전체가 죽으므로
    미리 걸러 명세서 4.4대로 product_id=NULL + __UNMATCHED__ 로 떨어뜨린다.
    """
    ids = {d["id"] for d in detections if isinstance(d.get("id"), int)}
    if not ids:
        return set()
    rows = (
        get_supabase()
        .table("product")
        .select("product_id")
        .in_("product_id", sorted(ids))
        .execute()
    ).data
    return {row["product_id"] for row in rows}


def _apply_to_order(order_id: int, rows: list[dict], store_id: int) -> None:
    """인식 결과를 주문 항목(AI_DETECTED)에 반영한다.

    탐지 1건 = 1행이지만 주문 항목은 상품별로 합산한다 - 꽈배기 3개가 장바구니에
    3줄로 뜨면 직원이 수량을 고칠 수 없다. 명세서 4.4 "동일 product_id는 기존 항목에 합산".

    Supabase 왕복은 상품 수와 무관하게 3회로 고정이다(가격 조회 / 기존 항목 조회 /
    일괄 INSERT). 예전에는 상품마다 가격 조회 + 항목 조회 + 쓰기로 3회씩 돌아서
    6종이면 18회, 1.4초가 걸렸다 - 왕복 1회가 60~90ms인 원격 DB라 그대로 체감된다.
    """
    grouped: dict[int, dict] = {}
    for row in rows:
        product_id = row["product_id"]
        if product_id is None:
            continue    # 매칭 실패 건은 detected_item에만 남기고 주문에는 안 넣는다
        entry = grouped.setdefault(product_id, {"quantity": 0, "needs_review": False})
        entry["quantity"] += row["quantity"]
        entry["needs_review"] |= row["is_below_threshold"]

    if not grouped:
        return

    prices = load_store_prices(list(grouped), store_id)

    items = []
    for product_id, entry in grouped.items():
        price = prices.get(product_id)
        if price is None:
            # 이 매장에서 안 파는 상품. 인식 기록은 남기되 금액에는 넣지 않는다.
            logger.warning("scan.product_not_sold", product_id=product_id)
            continue
        items.append(
            {
                "product_id": product_id,
                "quantity": entry["quantity"],
                "unit_price": price,
                "needs_review": entry["needs_review"],
            }
        )

    for product_id in add_quantities(order_id, items, "AI_DETECTED"):
        # 수량 상한(99) 초과. 한 상품만 못 담고 나머지는 정상 반영된다.
        logger.warning("scan.item_limit", product_id=product_id)


def _fail(scan_session_id: int, reason: str, image_url: str | None) -> dict:
    """실패를 세션에 기록하고 상세를 돌려준다.

    HTTP 오류로 바꾸지 않는 이유: 명세서 4.4가 "실패 시 status=FAILED +
    failure_reason을 HTTP 200으로. 오류가 아니라 인식 결과다"라고 정하고 있다.
    POS는 이걸 받아 "직접 추가" 안내로 넘어간다.
    """
    updated = (
        get_supabase()
        .table("scan_session")
        .update(
            {
                "status": "FAILED",
                "failure_reason": reason,
                "completed_at": datetime.now(UTC).isoformat(),
            }
        )
        .eq("scan_session_id", scan_session_id)
        .execute()
    ).data[0]
    logger.warning("scan.recognize_failed", failure_reason=reason)
    return _session_detail(updated, image_url=image_url)


@router.post(
    "/{scan_session_id}/recognize",
    response_model=ScanSessionDetail,
    responses={501: {"description": "MODEL_API_URL 미설정"}},
)
def recognize_scan_session(
    scan_session_id: int, staff: StaffContext = Depends(get_staff_context)
):
    """AI 인식 실행 (FR-02).

    이 프로세스는 모델을 로드하지 않는다. scan_session의 이미지를 서명 URL로 만들어
    MODEL_API_URL(팀원 Mac + ngrok)에 넘기고, 돌아온 탐지 결과를 detected_item에
    적재한 뒤 order_item(AI_DETECTED)에 합산한다.

    상태 전이: CAPTURED -> RECOGNIZING -> COMPLETED / FAILED
    """
    session = _load_session(scan_session_id, staff)

    if session["status"] == "RECOGNIZING":
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 인식 처리 중인 세션입니다")
    if session["status"] in ("DISCARDED", "COMPLETED"):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"인식할 수 없는 상태입니다: {session['status']}"
        )

    structlog.contextvars.bind_contextvars(scan_session_id=scan_session_id)
    logger.info("scan.recognize_requested")

    if not get_settings().model_api_url:
        raise HTTPException(
            status.HTTP_501_NOT_IMPLEMENTED, "AI 인식 서버가 아직 연결되지 않았습니다"
        )

    supabase = get_supabase()
    supabase.table("scan_session").update({"status": "RECOGNIZING"}).eq(
        "scan_session_id", scan_session_id
    ).execute()

    # 모델 호출 구간만 계측한다. NFR-01(3초 이내)이 재는 대상이 이 왕복이기 때문이다.
    image_url: str | None = None
    started = time.perf_counter()
    try:
        image_url = resolve_image_url(session)
        data = call_detect(image_url)
    except RecognitionError as exc:
        logger.warning("scan.model_error", reason=exc.reason, detail=exc.detail)
        return _fail(scan_session_id, exc.reason, image_url)
    recognition_ms = int((time.perf_counter() - started) * 1000)

    detections = data.get("detections") or []
    rows = to_detected_rows(scan_session_id, data, _known_product_ids(detections))
    if rows:
        supabase.table("detected_item").insert(rows).execute()

    if session["order_id"] is not None:
        _apply_to_order(session["order_id"], rows, staff.store_id)
        # 항목이 바뀌었으니 주문 금액 6종을 다시 쓴다. 이걸 빼먹으면 장바구니에는
        # 빵이 담겼는데 결제 금액이 0원인 주문이 남는다.
        order = (
            supabase.table("orders")
            .select("*")
            .eq("order_id", session["order_id"])
            .limit(1)
            .execute()
        ).data
        if order:
            recalculate(order[0])

    # status 조건을 거는 이유: 추론 중에 직원이 취소(FR-08)를 눌렀을 수 있다.
    # 조건이 없으면 이미 FAILED로 넘어간 세션을 COMPLETED로 덮어써서, 화면에서
    # 취소한 촬영이 결과로 되살아난다.
    updated = (
        supabase.table("scan_session")
        .update(
            {
                "status": "COMPLETED",
                "recognition_ms": recognition_ms,
                "completed_at": datetime.now(UTC).isoformat(),
            }
        )
        .eq("scan_session_id", scan_session_id)
        .eq("status", "RECOGNIZING")
        .execute()
    ).data

    if not updated:
        logger.info("scan.recognize_superseded")   # 취소가 이겼다. 그 상태를 존중한다.
        return _session_detail(_load_session(scan_session_id, staff), image_url=image_url)

    logger.info(
        "scan.recognize_completed",
        recognition_ms=recognition_ms,
        detected_count=len(rows),
    )
    return _session_detail(updated[0], image_url=image_url)


@router.post("/{scan_session_id}/cancel", response_model=ScanCancelResponse)
def cancel_scan_session(
    scan_session_id: int, staff: StaffContext = Depends(get_staff_context)
):
    """인식 처리 중 취소 (FR-08). 세션만 FAILED로 두고 주문 항목은 건드리지 않는다."""
    session = _load_session(scan_session_id, staff)
    if session["status"] in ("COMPLETED", "DISCARDED"):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"취소할 수 없는 상태입니다: {session['status']}"
        )

    supabase = get_supabase()
    updated = (
        supabase.table("scan_session")
        .update({"status": "FAILED", "failure_reason": "CANCELLED_BY_STAFF"})
        .eq("scan_session_id", scan_session_id)
        .execute()
    ).data[0]

    logger.info("scan.cancelled", scan_session_id=scan_session_id)
    return {
        "scan_session_id": updated["scan_session_id"],
        "status": updated["status"],
        "failure_reason": updated["failure_reason"],
    }


@router.post("/{scan_session_id}/discard", response_model=ScanDiscardResponse)
def discard_scan_session(
    scan_session_id: int, staff: StaffContext = Depends(get_staff_context)
):
    """다시 촬영 (FR-01). 세션을 DISCARDED로 바꾸고 **그 주문의 항목을 전부 비운다.**

    "다시 촬영"은 트레이를 새로 찍는 것이므로, 직전 인식 결과가 남아 있으면
    새 결과와 합산되어 개수가 두 배가 된다. 그래서 항목을 먼저 비운다.
    """
    session = _load_session(scan_session_id, staff)
    order_id = session["order_id"]

    supabase = get_supabase()
    reverted = 0
    if order_id is not None:
        order = (
            supabase.table("orders")
            .select("status")
            .eq("order_id", order_id)
            .limit(1)
            .execute()
        )
        if order.data and order.data[0]["status"] != "PENDING":
            raise HTTPException(
                status.HTTP_409_CONFLICT, "이미 처리된 주문은 되돌릴 수 없습니다"
            )

        existing = (
            supabase.table("order_item").select(
                "order_item_id").eq("order_id", order_id).execute()
        )
        reverted = len(existing.data)
        if reverted:
            supabase.table("order_item").delete().eq(
                "order_id", order_id).execute()
        # 손으로 쓴 dict는 컬럼을 빠뜨린다 - 실제로 point_earned가 빠져 있어서
        # 항목을 다 지운 주문이 "금액 0원인데 적립 예정 54p"로 남았다.
        # Amounts가 컬럼 6종을 한 곳에서 정의하므로 그것을 쓴다.
        supabase.table("orders").update(
            Amounts(0, 0, 0, 0, 0, 0).as_order_columns()
        ).eq("order_id", order_id).execute()

    updated = (
        supabase.table("scan_session")
        .update({"status": "DISCARDED"})
        .eq("scan_session_id", scan_session_id)
        .execute()
    ).data[0]

    logger.info("scan.discarded", scan_session_id=scan_session_id,
                reverted_item_count=reverted)
    return {
        "scan_session_id": updated["scan_session_id"],
        "order_id": order_id,
        "status": updated["status"],
        "reverted_item_count": reverted,
    }
