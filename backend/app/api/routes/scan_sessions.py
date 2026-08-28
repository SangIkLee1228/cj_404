"""트레이 촬영·인식 API (FR-01/02/03/10, API명세서 v1.2 · 4.4).

세션은 주문에 1:N으로 붙는다(SCAN_SESSION.order_id). 한 번의 계산에
기본 촬영(BASIC) + 추가 촬영(ADD) + 재촬영(RETAKE)이 여러 건 생길 수 있기 때문이다.

용어: 화면에는 "촬영"으로 표기한다. "스캔"은 금어(API명세서 6장).
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import StaffContext, get_staff_context
from app.core.supabase_client import get_supabase
from app.schemas.scan import (
    ScanCancelResponse,
    ScanDiscardResponse,
    ScanSessionCreate,
    ScanSessionCreated,
    ScanSessionDetail,
)
from app.services.orders import Amounts

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


def _session_detail(session: dict) -> dict:
    """세션 + 인식 항목. GET /{id} 와 recognize 응답이 같은 모양이다."""
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


# 186번째 줄
@router.post(
    "/{scan_session_id}/recognize",
    response_model=ScanSessionDetail,
    responses={501: {"description": "AI 추론 서버 미연결 (의도된 stub)"}},
)
def recognize_scan_session(
    scan_session_id: int, staff: StaffContext = Depends(get_staff_context)
):
    """AI 인식 실행 (FR-02, 아직 stub).

    의도한 아키텍처: 이 프로세스에서 모델을 로드하지 않고, 별도 GPU 인스턴스
    (backend/Dockerfile.gpu 참고)에 scan_session.image_url을 넘겨 추론을 위임한 뒤
    결과를 detected_item에 적재하고 order_item(AI_DETECTED)에 반영한다.

    연결 후 해야 할 것:
      - status를 RECOGNIZING -> COMPLETED / FAILED 로 전이
      - recognition_ms 기록 (NFR-01, 3초 이내 목표)
      - 실패는 HTTP 200 + status='FAILED' + failure_reason (오류가 아니라 인식 결과다)
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
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED, "AI 인식 서버가 아직 연결되지 않았습니다"
    )


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
