import structlog
from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.deps import StaffContext, get_staff_context
from app.core.supabase_client import get_supabase
from app.schemas.orders import OrderDetail, OrderItemCreate, OrderItemUpdate
from app.services.orders import (
    add_quantity,
    delete_item,
    ensure_pending,
    load_current_order,
    load_item,
    load_items,
    load_order,
    load_store_price,
    order_detail,
    recalculate,
    replace_item_product,
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
