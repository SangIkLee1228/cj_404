import structlog
from fastapi import APIRouter, Depends, Response, status

from app.core.deps import StaffContext, get_staff_context
from app.core.supabase_client import get_supabase
from app.schemas.orders import OrderDetail
from app.services.orders import load_current_order, load_items, load_order, order_detail

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
