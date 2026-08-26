from datetime import date

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

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
    OrderSummary,
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
    load_store_price,
    member_rates,
    money,
    order_detail,
    order_list_item,
    recalculate,
    replace_item_product,
    save_manual_discount,
    save_member_link,
    set_item_quantity,
)

router = APIRouter(prefix="/orders", tags=["orders"])
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
    supabase = get_supabase()
    rng = resolve_period(period, date_from, date_to)

    def scoped(select: str, count: str | None = None):
        """기간·매장·상태 필터를 한 곳에서 조립한다. 목록과 summary가 같은 조건을 써야 한다."""
        q = (
            supabase.table("orders")
            .select(select, count=count)
            .eq("store_id", staff.store_id)
            .gte("ordered_at", rng.start_utc.isoformat())
            .lt("ordered_at", rng.end_utc_exclusive.isoformat())
        )
        return q if order_status == "ALL" else q.eq("status", "PAID")

    page = (
        scoped(ORDER_LIST_SELECT, count="exact")
        .order("ordered_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    # summary는 페이지가 아니라 기간 전체 기준이다 (명세서 4.5)
    totals = scoped("total_amount, order_item(quantity)").execute().data
    summary = OrderSummary(
        sales_amount=sum(money(r["total_amount"]) for r in totals),
        order_count=len(totals),
        item_qty=sum(
            int(i["quantity"]) for r in totals for i in (r.get("order_item") or [])
        ),
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


@router.post("/{order_id}/pay", response_model=PayResponse)
def pay_order(
    order_id: int,
    payload: PayRequest,
    staff: StaffContext = Depends(get_staff_context),
):
    '''
    결제 확정 (FR-09, FR-12).

    상태 전이·재고 차감·매진임박 알림·포인트 적립을 Postgres 함수 하나로 묶는다.
    PostgREST에는 트랜잭션이 없어 나눠 호출하면 재고만 깎이고 결제가 실패하는 상태가 생긴다.
    '''
    order = load_order(order_id, staff)     # 404 / 403
    ensure_pending(order)

    if payload.point_used:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "포인트 사용은 이번 범위에 포함되지 않습니다.")

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
