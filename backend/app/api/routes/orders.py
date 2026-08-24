import structlog
from fastapi import APIRouter, Depends, status

from app.core.deps import StaffContext, get_staff_context
from app.core.supabase_client import get_supabase

router = APIRouter(prefix="/orders", tags=["orders"])
logger = structlog.get_logger("app.orders")


@router.post("", status_code=status.HTTP_201_CREATED)
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
            return _shape(row)

    created = (
        supabase.table("orders")
        .insert({"store_id": staff.store_id, "staff_id": staff.staff_id, "status": "PENDING"})
        .execute()
    ).data[0]

    logger.info("order.created", order_id=created["order_id"])
    return _shape(created)


def _shape(row: dict) -> dict:
    return {
        "order_id": row["order_id"],
        "status": row["status"],
        "gross_amount": int(round(float(row["gross_amount"]))),
        "discount_amount": int(round(float(row["discount_amount"]))),
        "total_amount": int(round(float(row["total_amount"]))),
        "items": [],
        "ordered_at": row["ordered_at"],
    }
