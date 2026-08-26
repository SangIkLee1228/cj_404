"""재고 API (FR-12/13, API명세서 v1.3 · 4.7).

INVENTORY는 매장×상품 스냅샷만 들고 있어 상품명·카테고리·매진임박 기준선이 없다.
PRODUCT는 FK로 바로 임베딩되지만(inventory.product_id → product.product_id),
STORE_PRODUCT는 INVENTORY와 직접 FK 관계가 없어(둘 다 PRODUCT/STORE만 참조) PostgREST
임베딩이 불가능하다 - stock_baseline_pct는 별도 조회 후 Python에서 병합한다.

remaining_pct/stock_status는 계산값이라 DB 컬럼이 아니라 여기서 만든다. 정렬 기준
(stock_status,remaining_qty)도 계산 필드라 DB가 아니라 Python에서 정렬한다.
"""

from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, Query, status

from app.core.deps import StaffContext, get_staff_context, require_manager
from app.core.errors import ApiError
from app.core.supabase_client import get_supabase
from app.schemas.inventory import (
    InventoryListItem,
    InventoryListResponse,
    RestockRequest,
    RestockResponse,
    StockStatus,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])
logger = structlog.get_logger("app.inventory")

_SELECT = (
    "product_id, produced_qty, sold_qty, remaining_qty, updated_at,"
    " product!inner(product_name, product_type, category, image_url)"
)

# "조치 필요 항목이 위" (API명세서 1.3) - OUT/LOW를 OK보다 먼저 보여준다.
_STATUS_PRIORITY: dict[StockStatus, int] = {"OUT": 0, "LOW": 1, "OK": 2}


def _stock_status(remaining_qty: int, remaining_pct: float, baseline_pct: int) -> StockStatus:
    if remaining_qty <= 0:
        return "OUT"
    if remaining_pct <= baseline_pct:
        return "LOW"
    return "OK"


def _remaining_pct(remaining_qty: int, produced_qty: int) -> float:
    if produced_qty <= 0:
        return 0.0
    return round(remaining_qty / produced_qty * 100, 1)


def _to_item(row: dict, baseline_pct: int) -> InventoryListItem:
    product = row["product"]
    produced = row["produced_qty"]
    remaining = row["remaining_qty"]
    remaining_pct = _remaining_pct(remaining, produced)
    return InventoryListItem(
        product_id=row["product_id"],
        product_name=product["product_name"],
        product_type=product["product_type"],
        category=product.get("category"),
        image_url=product.get("image_url"),
        produced_qty=produced,
        sold_qty=row["sold_qty"],
        remaining_qty=remaining,
        remaining_pct=remaining_pct,
        stock_baseline_pct=baseline_pct,
        stock_status=_stock_status(remaining, remaining_pct, baseline_pct),
        updated_at=row["updated_at"],
    )


def _baseline_map(store_id: int) -> dict[int, int]:
    supabase = get_supabase()
    rows = (
        supabase.table("store_product")
        .select("product_id, stock_baseline_pct")
        .eq("store_id", store_id)
        .execute()
        .data
    )
    return {r["product_id"]: r.get("stock_baseline_pct") or 20 for r in rows}


@router.get("", response_model=InventoryListResponse)
def list_inventory(
    stock_status: str = Query(default="ALL", alias="status", pattern="^(ALL|LOW|OUT)$"),
    q: str | None = Query(default=None, description="상품명 검색"),
    product_type: str | None = Query(default=None, pattern="^(BREAD|DRINK)$"),
    category: str | None = Query(default=None, description="목업의 카테고리 셀렉트"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    staff: StaffContext = Depends(get_staff_context),
):
    """재고 대시보드 (FR-13). 참고 정보일 뿐이며 자동 발주로 이어지지 않는다(NFR-07)
    - 화면에서도 "재고 12개"가 아니라 "추정 12개"로 표기할 것.
    """
    supabase = get_supabase()
    baseline_map = _baseline_map(staff.store_id)

    query = supabase.table("inventory").select(_SELECT).eq("store_id", staff.store_id)
    if product_type:
        query = query.eq("product.product_type", product_type)
    if category:
        query = query.eq("product.category", category)
    if q:
        query = query.ilike("product.product_name", f"%{q}%")

    rows = query.execute().data
    items = [_to_item(row, baseline_map.get(row["product_id"], 20)) for row in rows]

    if stock_status != "ALL":
        items = [item for item in items if item.stock_status == stock_status]

    items.sort(key=lambda it: (_STATUS_PRIORITY[it.stock_status], it.remaining_qty))

    total = len(items)
    page = items[offset : offset + limit]
    updated_at = max((it.updated_at for it in items), default=datetime.now(UTC))

    return InventoryListResponse(items=page, total=total, limit=limit, offset=offset, updated_at=updated_at)


@router.patch("/{product_id}/restock", response_model=RestockResponse)
def restock(
    product_id: int,
    payload: RestockRequest,
    staff: StaffContext = Depends(require_manager),
):
    """수동 보충 (FR-13, 매니저 전용). 보충 이력은 남기지 않는다(DB설계서 v2.2 · 4.13).

    PostgREST는 원자적 증분 UPDATE(SET x = x + :qty)를 지원하지 않아 읽은 뒤 계산한 값을
    다시 쓴다 - 매니저 단건 조작이라 동시 경합 가능성은 낮다고 보고 MVP 범위로 받아들인다.
    """
    supabase = get_supabase()
    current = (
        supabase.table("inventory")
        .select("produced_qty, remaining_qty")
        .eq("store_id", staff.store_id)
        .eq("product_id", product_id)
        .limit(1)
        .execute()
        .data
    )
    if not current:
        raise ApiError(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "재고 항목을 찾을 수 없습니다")

    row = current[0]
    new_produced = row["produced_qty"] + payload.qty
    new_remaining = row["remaining_qty"] + payload.qty

    (
        supabase.table("inventory")
        .update({"produced_qty": new_produced, "remaining_qty": new_remaining})
        .eq("store_id", staff.store_id)
        .eq("product_id", product_id)
        .execute()
    )

    baseline_map = _baseline_map(staff.store_id)
    baseline = baseline_map.get(product_id, 20)
    remaining_pct = _remaining_pct(new_remaining, new_produced)

    logger.info(
        "inventory.restocked", product_id=product_id, store_id=staff.store_id, qty=payload.qty
    )

    return RestockResponse(
        product_id=product_id,
        produced_qty=new_produced,
        remaining_qty=new_remaining,
        stock_status=_stock_status(new_remaining, remaining_pct, baseline),
    )
