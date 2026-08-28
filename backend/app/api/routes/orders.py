from datetime import date

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from postgrest.exceptions import APIError

from app.core.config import get_settings
from app.core.deps import StaffContext, get_staff_context
from app.core.errors import ApiError
from app.core.supabase_client import get_supabase
from app.core.timeutil import resolve_period
from app.schemas.orders import (
    ManualDiscountRequest,
    MemberLinkRequest,
    OrderDetail,
    OrderItemCreate,
    OrderItemUpdate,
    OrderListResponse,
    PayRequest,
    PayResponse,
)
from app.services.orders import (
    ORDER_LIST_SELECT,
    add_quantity,
    cancel_order,
    compute_amounts,
    delete_item,
    ensure_pending,
    load_current_order,
    load_grade_rates,
    load_item,
    load_items,
    load_member_by_phone,
    load_order,
    load_order_summary,
    load_store_price,
    member_rates,
    money,
    order_detail,
    order_list_item,
    order_scope,
    recalculate,
    replace_item_product,
    save_manual_discount,
    save_member_link,
    set_item_quantity,
)

router = APIRouter(prefix="/orders", tags=["orders"])

# Postgres의 serialization_failure. pay_order가 "전체 롤백하고 재시도하라"는 뜻으로
# 이 코드를 붙여 예외를 던진다 (db/17_pay_order.sql [v3]).
SERIALIZATION_FAILURE = "40001"
logger = structlog.get_logger("app.orders")


@router.post("", status_code=status.HTTP_201_CREATED, response_model=OrderDetail)
def create_order(staff: StaffContext = Depends(get_staff_context)):
    '''
    계산 시작 (FR-09)

    멱등: 항목이 0개인 PENDING 주문이 이미 있으면 새로 만들지 않고 그것을 반환한다.
    직원이 '새 계산' 을 여러번 눌러도 빈 주문이 쌓이지 않는다.
    '''
    supabase = get_supabase()

    existing = (
        supabase.table("orders")
        .select("*, order_item(order_item_id)")
        .eq("store_id", staff.store_id)
        .eq("staff_id", staff.staff_id)
        .eq("status", "PENDING")
        .order("ordered_at", desc=True)
        .limit(5)
        .execute()
    )

    for row in existing.data:
        if not row.get("order_item"):
            return order_detail(load_order(row["order_id"], staff), [])

    created = (
        supabase.table("orders")
        .insert({"store_id": staff.store_id, "staff_id": staff.staff_id, "status": "PENDING"})
        .execute()
    ).data[0]

    logger.info("order.created", order_id=created["order_id"])
    return order_detail(load_order(created["order_id"], staff), [])


@router.get(
    "/current",
    response_model=OrderDetail,
    responses={204: {"description": "진행 중인 주문 없음"}},
)
def get_current_order(staff: StaffContext = Depends(get_staff_context)):
    """진행 중인 주문 복구 (FR-09). 없으면 204."""
    order = load_current_order(staff)
    if order is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return order_detail(order, load_items(order["order_id"]))


@router.get("", response_model=OrderListResponse)
def list_orders(
    period: str = Query(default="TODAY", pattern="^(TODAY|7D|30D)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    order_status: str = Query(
        default="PAID", alias="status", pattern="^(PAID|ALL)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    staff: StaffContext = Depends(get_staff_context),
):
    """판매 내역 목록 (FR-17). 기간 경계는 KST 기준이다."""
    rng = resolve_period(period, date_from, date_to)
    paid_only = order_status != "ALL"

    page = (
        order_scope(
            store_id=staff.store_id,
            rng=rng,
            paid_only=paid_only,
            select=ORDER_LIST_SELECT,
            count="exact",
        )
        .order("ordered_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    # summary는 페이지가 아니라 **조회 기간 전체** 기준이다 (명세서 4.5).
    # 집계는 DB 함수(db/19_order_summary.sql)가 한 번에 계산한다. 예전에는 기간 전체
    # 주문과 딸린 order_item을 전부 받아 파이썬으로 더했는데, 주문이 쌓이는 만큼
    # 그대로 느려지는 구조였다. 목록과 같은 필터를 쓰도록 order_scope로 묶었다.
    summary = load_order_summary(
        store_id=staff.store_id, rng=rng, paid_only=paid_only
    )

    return OrderListResponse(
        items=[order_list_item(row) for row in page.data],
        total=page.count or 0,
        limit=limit,
        offset=offset,
        summary=summary,
    )


@router.get("/{order_id}", response_model=OrderDetail)
def get_order(order_id: int, staff: StaffContext = Depends(get_staff_context)):
    """주문 상세 (FR-17)."""
    order = load_order(order_id, staff)
    return order_detail(order, load_items(order_id))


@router.post("/{order_id}/items", status_code=status.HTTP_201_CREATED, response_model=OrderDetail)
def add_order_item(
    order_id: int,
    payload: OrderItemCreate,
    staff: StaffContext = Depends(get_staff_context),
):
    """카탈로그·추천에서 상품 직접 담기 (FR-06)."""
    order = load_order(order_id, staff)
    ensure_pending(order)

    unit_price = load_store_price(payload.product_id, staff.store_id)
    add_quantity(order_id, payload.product_id,
                 payload.quantity, unit_price, "MANUAL_ADD")

    order, items = recalculate(order)
    return order_detail(order, items)


@router.patch("/{order_id}/items/{order_item_id}", response_model=OrderDetail)
def update_order_item(
    order_id: int,
    order_item_id: int,
    payload: OrderItemUpdate,
    staff: StaffContext = Depends(get_staff_context),
):
    """수량 변경(FR-04) 또는 상품 재선택(FR-05)."""
    order = load_order(order_id, staff)
    ensure_pending(order)
    item = load_item(order_id, order_item_id)

    if payload.product_id is not None and payload.product_id != item["product_id"]:
        replace_item_product(
            order_id, item, payload.product_id, payload.quantity or item["quantity"], staff.store_id
        )
    elif payload.quantity is not None:
        set_item_quantity(item, payload.quantity)
    else:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "quantity 또는 product_id 중 하나는 보내야 합니다"
        )

    order, items = recalculate(order)
    return order_detail(order, items)


@router.delete("/{order_id}/items/{order_item_id}", response_model=OrderDetail)
def remove_order_item(
    order_id: int,
    order_item_id: int,
    staff: StaffContext = Depends(get_staff_context),
):
    """항목 삭제 (FR-04). 응답은 갱신된 주문 전체."""
    order = load_order(order_id, staff)
    ensure_pending(order)
    item = load_item(order_id, order_item_id)

    delete_item(item["order_item_id"])

    order, items = recalculate(order)
    return order_detail(order, items)


@router.post("/{order_id}/discount", response_model=OrderDetail)
def apply_manual_discount(
        order_id: int,
        payload: ManualDiscountRequest,
        staff: StaffContext = Depends(get_staff_context),):
    '''
    직원 수동 할인 (FR-08). 덮어쓰기 방식이며 amount = 0 이면 해제. 
    '''
    order = load_order(order_id, staff)
    ensure_pending(order)

    items = load_items(order_id)
    discount_rate, point_earn_rate = load_grade_rates(
        order.get("applied_grade_id"))
    amounts = compute_amounts(items, discount_rate=discount_rate,
                              point_earn_rate=point_earn_rate, manual_discount_amount=payload.amount,)

    # compute_amounts 는 gross 를 넘는 할인을 잘라낸다. 잘렸다는 건 초과했다는 뜻이다.
    if amounts.manual_discount_amount != payload.amount:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"할인 금액이 주문 금액을 초과합니다. (최대 {amounts.manual_discount_amount} 원)", )

    order = save_manual_discount(
        order, amounts, payload.reason, staff.staff_id)
    logger.info("order.discount_applied", order_id=order_id,
                staff_id=staff.staff_id,
                amount=payload.amount,
                )
    return order_detail(order, items)


@router.post("/{order_id}/cancel", response_model=OrderDetail)
def cancel_current_order(order_id: int, staff: StaffContext = Depends(get_staff_context), ):
    '''
    계산 취소 (FR-09). PENDING 에서만 가능하고 PAID 면 409.
    '''
    order = load_order(order_id, staff)
    ensure_pending(order)

    order = cancel_order(order)
    logger.info("order.cancelled", order_id=order_id, staff_id=staff.staff_id)
    return order_detail(order, load_items(order_id))


@router.post("/{order_id}/member", response_model=OrderDetail)
def link_member(
    order_id: int,
    payload: MemberLinkRequest,
    staff: StaffContext = Depends(get_staff_context),
):
    """CJ ONE 회원 연결 (FR-18). 등급 할인·적립이 즉시 반영된다."""
    order = load_order(order_id, staff)
    ensure_pending(order)

    member = load_member_by_phone(payload.phone)
    discount_rate, point_earn_rate = member_rates(member)

    items = load_items(order_id)
    amounts = compute_amounts(
        items,
        discount_rate=discount_rate,
        point_earn_rate=point_earn_rate,
        manual_discount_amount=money(order.get("manual_discount_amount") or 0),
    )

    order = save_member_link(order, member, amounts)
    # 휴대폰번호는 뒤 4자리만 남긴다 (NFR-06)
    logger.info(
        "order.member_linked",
        order_id=order_id,
        member_id=member["member_id"],
        phone_tail=payload.phone[-4:],
    )
    return order_detail(order, items)


@router.delete("/{order_id}/member", response_model=OrderDetail)
def unlink_member(
    order_id: int,
    staff: StaffContext = Depends(get_staff_context),
):
    """회원 연결 해제 (FR-18). 할인·적립이 0으로 복귀한다."""
    order = load_order(order_id, staff)
    ensure_pending(order)

    items = load_items(order_id)
    amounts = compute_amounts(
        items,
        manual_discount_amount=money(order.get("manual_discount_amount") or 0),
    )

    order = save_member_link(order, None, amounts)
    logger.info("order.member_unlinked", order_id=order_id)
    return order_detail(order, items)

# __________ pay __________

# 시연용 결제 실패 (API명세서 3장 · 9장 🟡4).
#
# 명세서에는 "결제 실패 -> 402, 주문은 PENDING 유지"라는 분기가 있는데, PG(카드
# 결제사)를 붙이지 않아 실패를 만들 방법이 자체가 없었다. 그래서 FE는 존재하지 않는
# 응답을 처리하는 코드를 들고 있어야 했다.
#
# MOCK_PAYMENT_FAILURE=true 일 때만 헤더로 실패를 강제한다. 기본값은 꺼짐이고
# AUTH_DISABLED와도 분리돼 있어, .env.example을 그대로 복사한 배포에 딸려가지 않는다.
MOCK_FAILURE_HEADER = "x-mock-payment-failure"


def _reject_if_mock_failure(request: Request) -> None:
    """헤더가 켜져 있으면 아무것도 쓰지 않고 402로 끝낸다.

    호출 위치가 중요하다 - pay_order RPC보다 **앞**이어야 주문이 PENDING으로 남고
    재고도 그대로다. 명세서가 말하는 "화면도 옮기지 않는다"가 성립한다.
    """
    if not get_settings().mock_payment_failure:
        return
    if request.headers.get(MOCK_FAILURE_HEADER, "").lower() not in {"1", "true", "yes"}:
        return
    raise ApiError(
        status.HTTP_402_PAYMENT_REQUIRED,
        "PAYMENT_FAILED",
        "카드 승인이 거절되었습니다. 다른 결제 수단으로 다시 시도해 주세요.",
    )



@router.post("/{order_id}/pay", response_model=PayResponse)
def pay_order(
    order_id: int,
    payload: PayRequest,
    request: Request,
    staff: StaffContext = Depends(get_staff_context),
):
    '''
    결제 확정 (FR-09, FR-12).

    상태 전이·재고 차감·매진임박 알림·포인트 적립을 Postgres 함수 하나로 묶는다.
    PostgREST에는 트랜잭션이 없어 나눠 호출하면 재고만 깎이고 결제가 실패하는 상태가 생긴다.
    '''
    order = load_order(order_id, staff)     # 404 / 403
    ensure_pending(order)

    _reject_if_mock_failure(request)

    if payload.point_used:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "포인트 사용은 이번 범위에 포함되지 않습니다.")

    try:
        result = (
            get_supabase()
            .rpc(
                "pay_order",
                {
                    "p_order_id": order_id,
                    "p_store_id": staff.store_id,
                    "p_payment_method": payload.payment_method,
                },
            )
            .execute()
        ).data
    except APIError as exc:
        # pay_order는 쓰기를 시작한 뒤 문제를 발견하면 return이 아니라 raise를 쓴다.
        # return은 이미 깎은 재고를 되돌리지 않기 때문이다. 그래서 전체 롤백을 노린
        # 이 예외들만 40001(serialization_failure)로 올려 보내고, 여기서 409로 바꾼다.
        # 그대로 두면 APIError는 HTTPException이 아니라 500 INTERNAL_ERROR로 나간다.
        if str(getattr(exc, "code", "")) != SERIALIZATION_FAILURE:
            raise
        message = str(getattr(exc, "message", "") or "")
        logger.warning("order.pay_conflict", order_id=order_id, detail=message)

        # 같은 40001이라도 원인이 둘이다. FE가 보여줄 안내가 다르므로 나눠서 내보낸다.
        if message.startswith("INVENTORY_RACE"):
            raise ApiError(
                status.HTTP_409_CONFLICT,
                "INVENTORY_SHORTAGE",
                "결제 직전에 재고가 소진됐습니다. 수량을 확인한 뒤 다시 시도해 주세요.",
            ) from exc

        raise ApiError(
            status.HTTP_409_CONFLICT,
            "ORDER_CHANGED",
            "결제 중 주문 내용이 바뀌었습니다. 화면을 새로고침한 뒤 다시 결제해 주세요.",
        ) from exc

    if not result.get("ok"):
        code = result.get("error")

        if code == "INVENTORY_SHORTAGE":
            shortages = result.get("shortages", [])
            names = ", ".join(s["product_name"] for s in shortages)
            raise ApiError(
                status.HTTP_409_CONFLICT,
                "INVENTORY_SHORTAGE",
                f"{names}의 잔여 수량이 부족합니다",
                details=[
                    {
                        "field": f"product_id:{s['product_id']}",
                        "reason": f"requested {s['requested']}, remaining {s['remaining']}",
                    }
                    for s in shortages
                ],
            )

        if code == "EMPTY_ORDER":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "항목이 없는 주문은 결제할 수 없습니다"
            )

        if code == "AMOUNT_STALE":
            # 주문에 적힌 공급가와 항목 합계가 어긋난 상태. 재계산이 누락됐거나
            # 다른 단말이 항목을 건드렸다. 틀린 금액으로 확정하느니 막는다.
            logger.warning(
                "order.amount_stale", order_id=order_id,
                gross_amount=result.get("gross_amount"),
                items_total=result.get("items_total"),
            )
            raise ApiError(
                status.HTTP_409_CONFLICT,
                "AMOUNT_STALE",
                "주문 금액이 최신이 아닙니다. 화면을 새로고침한 뒤 다시 결제해 주세요.",
            )

        raise HTTPException(status.HTTP_409_CONFLICT, "결제할 수 없는 주문 상태입니다")

    logger.info(
        "order.paid",
        order_id=order_id,
        staff_id=staff.staff_id,
        total_amount=result["total_amount"],
        point_earned=result["point_earned"],
        notifications=len(result["notifications_created"]),
    )
    return PayResponse(**result)
