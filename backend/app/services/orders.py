"""주문 금액 계산 (API명세서 v1.3 · 1.5).

라우트가 아니라 여기에 두는 이유:
    항목 추가·수정·삭제, 회원 연결·해제, 수동 할인, 결제 —
    6개 엔드포인트가 전부 "항목이 바뀌면 주문 금액을 다시 쓴다"는 같은 일을 한다.
    라우트마다 복사해두면 한 곳만 고치고 나머지를 놓친다.

DB 접근을 섞지 않은 이유:
    이 모듈은 Supabase를 import하지 않는다. 순수 함수라 테스트에서 DB 없이 검증된다.
    금액은 틀리면 곧바로 사고인 영역이라 테스트 가능성을 최우선으로 둔다.
"""

from dataclasses import dataclass  # 금액 묶음을 담을 Amounts 클래스용
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal  # 명세서 1.5가 floor를 명시 → 반올림 아님

import structlog  # 기존 코드가 쓰는 로거. print/logging 대신 통일
from fastapi import HTTPException, status
from postgrest.exceptions import APIError

from app.core.deps import StaffContext
from app.core.formatting import item_summary, phone_variants
from app.core.masking import mask_name
from app.core.supabase_client import fetch_all, get_supabase
from app.core.timeutil import DateRange
from app.schemas.orders import (
    OrderDetail,
    OrderItemRead,
    OrderListItem,
    OrderMemberSummary,
    OrderSummary,
)

logger = structlog.get_logger("app.services.orders")
#        ^ 이름을 모듈 경로로 주면 로그에서 어디서 났는지 바로 보인다.
#          routes/orders.py는 "app.orders", 여기는 "app.services.orders".

MIN_ITEM_QUANTITY = 1    # 명세서 4.5 "quantity는 1~99"
MAX_ITEM_QUANTITY = 99


def money(value: object) -> int:
    return int(round(float(value)))
#          │    │      └ Supabase가 DECIMAL을 "2200.00"(문자열)로 줄 때가 있어 float를 먼저 거친다
#          │    └ 2199.9999 같은 부동소수 찌꺼기를 정수 경계로 붙인다
#          └ 명세서 1.2 "금액은 정수 JSON number" — 응답에 소수점이 나가면 안 된다


def _floor_rate(amount: int, rate: Decimal | float | str) -> int:
    #   ^ 언더스코어로 시작 = 이 모듈 안에서만 쓰는 내부 함수라는 파이썬 관례
    return int((Decimal(amount) * Decimal(str(rate))).to_integral_value(rounding=ROUND_FLOOR))
#                                        └────┬────┘                            └─────┬─────┘
#                                             │                                       │
#              Decimal(0.0029) 는 float 오차를 물려받아                      명세서 1.5가 지정한 내림.
#              0.002899999... 가 된다. str()을 거쳐야 0.0029.               반올림(ROUND_HALF_UP)이면
#              Supabase가 비율을 float으로 줄 수 있어 필요하다.              적립이 1 더 나간다.


@dataclass(frozen=True)
#          └ 만든 뒤 수정 불가. amounts.total_amount = 0 하면 에러가 난다.
#            금액을 나중에 손대는 코드가 생기면 "어디서 바뀌었지"를 추적할 수 없다.
#            바꾸고 싶으면 compute_amounts()를 다시 부르라고 강제하는 장치.
class Amounts:
    gross_amount: int                 # Σ(수량 × 단가)
    membership_discount_amount: int   # floor(gross × 등급할인율)
    manual_discount_amount: int       # 직원 수동 할인 (FR-08)
    discount_amount: int              # 위 둘의 합
    total_amount: int                 # gross - discount
    point_earned: int                 # floor(total × 적립률)

    def as_order_columns(self) -> dict[str, int]:
        """orders 테이블 UPDATE에 그대로 넘길 dict.

        컬럼명 매핑을 라우트마다 손으로 쓰면 오타 하나로 금액이 안 반영된다.
        여기서 한 번만 정의한다.
        """
        return {
            "gross_amount": self.gross_amount,
            "membership_discount_amount": self.membership_discount_amount,
            "manual_discount_amount": self.manual_discount_amount,
            "discount_amount": self.discount_amount,
            "total_amount": self.total_amount,
            "point_earned": self.point_earned,
        }


def line_subtotal(quantity: int, unit_price: int) -> int:
    return quantity * unit_price


def compute_amounts(
    items: list[dict],
    *,
    discount_rate: Decimal | float | str = Decimal("0"),
    point_earn_rate: Decimal | float | str = Decimal("0"),
    manual_discount_amount: int = 0,
) -> Amounts:
    """항목 목록에서 주문 금액 전부를 다시 계산한다 (명세서 1.5).

        gross_amount               = Σ(quantity × unit_price)
        membership_discount_amount = floor(gross × grade.discount_rate)
        discount_amount            = membership + manual
        total_amount               = gross − discount
        point_earned               = floor(total × grade.point_earn_rate)

    items는 quantity·unit_price 키만 있으면 되는 dict 목록이다. Supabase 응답 행을
    그대로 넘겨도 되고 테스트에서 손으로 만든 dict를 넘겨도 된다. 특정 타입에
    묶지 않으려고 일부러 dict로 받는다.

    키워드 전용(*) 으로 받는 이유: discount_rate와 point_earn_rate는 둘 다 Decimal
    비율이라 위치 인자로 두면 순서가 바뀌어도 조용히 통과한다. 호출부에서 이름을
    쓰도록 강제한다.
    """
    # 증분(gross += ...)이 아니라 매번 전체 SUM이다. PostgREST에 트랜잭션이 없어
    # 항목 쓰기와 금액 쓰기 사이에서 실패할 수 있는데, 전체 재계산이면 다음 요청이
    # 스스로 바로잡는다. 증분이면 한 번 틀어진 값이 영구히 남는다.
    gross = sum(int(item["quantity"]) * money(item["unit_price"])
                for item in items)

    membership = _floor_rate(gross, discount_rate)
    manual = manual_discount_amount

    # 항목이 줄어 gross가 기존 수동 할인보다 작아질 수 있다.
    # (예: 500원 할인을 걸어둔 뒤 마지막 항목을 삭제 -> gross 300, manual 500)
    # 명세서는 이 경우를 정의하지 않는다. 삭제를 400으로 막으면 직원이 빠져나갈 방법이
    # 없어지므로 할인을 gross에 맞춰 깎고 경고 로그를 남긴다.
    # 직원이 금액을 직접 넣는 POST /discount 쪽은 라우트가 미리 검사해 400을 준다 -
    # 그쪽은 입력 오류이지 여기처럼 파생된 결과가 아니기 때문이다.
    if membership + manual > gross:
        clamped = max(0, gross - membership)
        logger.warning(
            "order.manual_discount_clamped",
            gross_amount=gross,
            membership_discount_amount=membership,
            requested_manual=manual,
            applied_manual=clamped,
        )
        manual = clamped

    discount = membership + manual
    total = gross - discount

    return Amounts(
        gross_amount=gross,
        membership_discount_amount=membership,
        manual_discount_amount=manual,
        discount_amount=discount,
        total_amount=total,
        # 적립은 할인 후 실제 결제액 기준이다. gross 기준으로 잡으면 할인받고
        # 적립까지 더 받는 구조가 되어 명세서 1.5와 어긋난다.
        point_earned=_floor_rate(total, point_earn_rate),
    )


_ITEM_SELECT = (
    "order_item_id, product_id, quantity, unit_price, subtotal, source_type,"
    " needs_review, product(product_name)"
)


def recalculate(order: dict) -> tuple[dict, list[dict]]:
    order_id = order["order_id"]

    items = load_items(order_id)
    discount_rate, point_earn_rate = load_grade_rates(
        order.get("applied_grade_id"))

    amounts = compute_amounts(
        items,
        discount_rate=discount_rate,
        point_earn_rate=point_earn_rate,
        manual_discount_amount=money(order.get("manual_discount_amount") or 0),
    )

    columns = amounts.as_order_columns()

    # status 조건을 함께 거는 이유: ensure_pending()은 몇 밀리초 전에 읽은 스냅샷을
    # 본 것이라, 그 사이 다른 단말이 결제를 끝냈을 수 있다. 조건이 없으면 이미 PAID인
    # 주문의 금액을 덮어써서, 실제로 받은 금액과 장부가 영구히 어긋난다.
    # 조건이 걸리면 아무 행도 안 맞고, 그때는 조용히 넘어가지 않고 409로 알린다.
    updated = (
        get_supabase()
        .table("orders")
        .update(columns)
        .eq("order_id", order_id)
        .eq("status", "PENDING")
        .execute()
    ).data

    if not updated:
        logger.warning("order.recalculate_on_non_pending", order_id=order_id)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "결제가 완료되었거나 취소된 주문입니다. 화면을 새로고침해 주세요.",
        )

    return {**order, **columns}, items


def load_items(order_id: int) -> list[dict]:
    '''주문의 항목 목록. 정렬을 명시해야 POS 화면에서 순서가 흔들리지 않는다.'''
    return (
        get_supabase()
        .table("order_item")
        .select(_ITEM_SELECT)
        .eq("order_id", order_id)
        .order("order_item_id")
        .execute()
    ).data


def load_grade_rates(applied_grade_id: int | None) -> tuple[Decimal, Decimal]:
    '''(할인율, 적립률). 회원 미연결이면 (0,0)'''
    if applied_grade_id is None:
        return Decimal("0"), Decimal("0")

    rows = (
        get_supabase()
        .table("membership_grade")
        .select("discount_rate, point_earn_rate")
        .eq("grade_id", applied_grade_id)
        .limit(1)
        .execute()
    ).data

    if not rows:
        logger.warning("order.grade_not_found",
                       applied_grade_id=applied_grade_id)
        return Decimal("0"), Decimal("0")

    return (
        Decimal(str(rows[0]["discount_rate"])),
        Decimal(str(rows[0]["point_earn_rate"])),
    )


ORDER_STATUS_LABEL = {
    "PAID": "결제 완료된",
    "CANCELLED": "취소된",
    "PAYING": "결제 진행 중인",
}

_ORDER_SELECT = "*, member(member_id, name, membership_grade(grade_code, grade_name))"


def load_order(order_id: int, staff: StaffContext) -> dict:
    '''
    주문 1 건을 읽고 접근 권한을 확인한다. 없으면 404, 다른 매장 주문이면 403.
    모든 주문 API 가 가장 먼저 부르는 함수다.
    여기를 통과한 order 는 '존재하고, 이 직원이 손대도 되는 주문' 이 보장된다.
    '''
    rows = (
        get_supabase()
        .table("orders")
        .select("*, member(member_id, name, membership_grade(grade_code, grade_name))")
        .eq("order_id", order_id)
        .limit(1)
        .execute()
    ).data

    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "주문을 찾을 수 없습니다.")

    order = rows[0]
    if order["store_id"] != staff.store_id:
        # store_id 는 url 이 아니라 인증 컨텍스트에서만 온다 (core/deps.py 규약)
        logger.warning(
            "order.cross_store_access",
            order_id=order_id,
            staff_id=staff.staff_id,
            staff_store_id=staff.store_id,
            order_store_id=order["store_id"],
        )
        raise HTTPException(status.HTTP_403_FORBIDDEN, "다른 매장의 주문입니다.")

    return order


def ensure_pending(order: dict) -> None:
    '''
    항목 / 할인 / 회원을 건드릴 수 있는 상태인지 확인한다. 아니면 409.
    상태 기계에서 PENDING 밖으로 나간 주문은 되돌릴 수 없다 (명세서 3장).
    '''
    if order["status"] != "PENDING":
        label = ORDER_STATUS_LABEL.get(order["status"], order["status"])
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"{label} 주문은 수정할 수 없습니다.")


def _embedded(value: object) -> dict | None:
    '''
    PostgREST 임베드 결과를 dict로 정규화한다.

    1:1 관계여도 관계 정의에 따라 [{...}] 리스트로 올 때가 있다.
    routes/members.py의 _flatten도 같은 방어를 하고 있다 - 실제로 겪은 문제라는 뜻이다.
    '''
    if isinstance(value, list):
        return value[0] if value else None
    return value if isinstance(value, dict) else None


def order_detail(order: dict, items: list[dict]) -> OrderDetail:
    '''
    주문 상세 응답을 조립한다 (API명세서 4.5).

    DB를 타지 않는다. 라우트가 load_order / recalculate로 받아온 데이터를 넘기면
    모양만 만든다. 덕분에 dict만으로 테스트할 수 있다.
    '''
    member_row = _embedded(order.get("member"))
    grade_row = _embedded(member_row.get(
        "membership_grade")) if member_row else None

    return OrderDetail(
        order_id=order["order_id"],
        status=order["status"],
        ordered_at=order["ordered_at"],
        paid_at=order["paid_at"],
        payment_method=order["payment_method"],
        gross_amount=money(order["gross_amount"]),
        membership_discount_amount=money(order["membership_discount_amount"]),
        manual_discount_amount=money(order["manual_discount_amount"]),
        discount_amount=money(order["discount_amount"]),
        total_amount=money(order["total_amount"]),
        member=None
        if member_row is None
        else OrderMemberSummary(
            member_id=member_row["member_id"],
            name=mask_name(member_row["name"]),
            grade_code=grade_row["grade_code"] if grade_row else None,
        ),
        point_earned=order["point_earned"],
        point_used=order["point_used"],
        correction_count=0,  # CORRECTION_LOG는 2차 (명세서 4.5)
        items=[
            OrderItemRead(
                order_item_id=row["order_item_id"],
                product_id=row["product_id"],
                product_name=(_embedded(row.get("product"))
                              or {}).get("product_name"),
                quantity=row["quantity"],
                unit_price=money(row["unit_price"]),
                subtotal=money(row["subtotal"]),
                source_type=row["source_type"],
                # TODO: recognize 구현 시 detected_item과 연결 (결정 C)
                # 하드코딩 False 제거
                needs_review=bool(row.get("needs_review", False)),
            )
            for row in items
        ],
    )


def load_current_order(staff: StaffContext) -> dict | None:
    """이 직원의 가장 최근 PENDING 주문. 없으면 None.

    새로고침이나 화면 왕복(S-05) 후 계산을 이어가기 위한 세션 복구용이다 (명세서 4.5).
    """
    rows = (
        get_supabase()
        .table("orders")
        .select(_ORDER_SELECT)
        .eq("store_id", staff.store_id)
        .eq("staff_id", staff.staff_id)
        .eq("status", "PENDING")
        .order("ordered_at", desc=True)
        .limit(1)
        .execute()
    ).data
    return rows[0] if rows else None


def load_store_price(product_id: int, store_id: int) -> int:
    ''' 이 매장에서 판매 중인 상품의 현재 가격. 없거나 판매 중지면 404 '''
    rows = (
        get_supabase()
        .table("store_product")
        .select("price, is_active, product!inner(is_active)")
        .eq("store_id", store_id)
        .eq("product_id", product_id)
        .limit(1)
        .execute()
    ).data

    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "판매 중인 상품이 아닙니다.")

    row = rows[0]
    product = _embedded(row.get("product")) or {}
    if not row["is_active"] or not product.get("is_active", True):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "판매 중인 상품이 아닙니다.")

    return money(row["price"])


def load_item(order_id: int, order_item_id: int) -> dict:
    ''' 주문 항목 1건. 다른 주문의 항목이면 404 (부모-자식 일치 검증) '''
    rows = (
        get_supabase()
        .table("order_item")
        .select("order_item_id, product_id, quantity, unit_price, source_type")
        .eq("order_item_id", order_item_id)
        .eq("order_id", order_id)
        .limit(1)
        .execute()
    ).data

    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "주문 항목을 찾을 수 없습니다.")
    return rows[0]


def _reject_over_limit(current: int, adding: int) -> None:
    """합산 결과가 한 행의 수량 상한을 넘으면 400.

    예전에는 min()으로 조용히 잘랐다. 그러면 트레이에 105개를 올려도 99개 값만 받고
    나머지는 장부에서 사라진다 - 직원도 손님도 모른 채 금액이 어긋난다.
    """
    if current + adding > MAX_ITEM_QUANTITY:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"한 상품의 수량은 {MAX_ITEM_QUANTITY}개를 넘을 수 없습니다 "
            f"(현재 {current}, 추가 요청 {adding})",
        )


def ensure_merge_within_limit(
    order_id: int, product_id: int, quantity: int, *, exclude_item_id: int | None = None
) -> None:
    """합산했을 때 한도를 넘는지 **쓰기 전에** 확인한다 (FR-05 재선택용).

    exclude_item_id는 이번에 지울 행이다. 자기 자신을 세면 안 된다.
    """
    rows = (
        get_supabase()
        .table("order_item")
        .select("order_item_id, quantity")
        .eq("order_id", order_id)
        .eq("product_id", product_id)
        .execute()
    ).data
    current = sum(
        int(row["quantity"]) for row in rows if row["order_item_id"] != exclude_item_id
    )
    _reject_over_limit(current, quantity)


def add_quantity(order_id: int, product_id: int, quantity: int, unit_price: int, source_type: str) -> None:
    ''''
    동일 상품이 이미 있으면 수량 합산, 없으면 새 행 (명세서 4.5).

    합산 시 source_type은 넘어온 값으로 승격한다 - AI가 넣은 항목을 직원이 더 담으면
    "직원이 개입한 항목"으로 기록되어야 재학습 데이터가 정확해진다.
    '''
    supabase = get_supabase()
    rows = (
        supabase.table("order_item")
        .select("order_item_id, quantity, unit_price")
        .eq("order_id", order_id)
        .eq("product_id", product_id)
        .limit(1)
        .execute()
    ).data

    if not rows:
        supabase.table("order_item").insert(
            {
                "order_id": order_id,
                "product_id": product_id,
                "quantity": quantity,
                "unit_price": unit_price,
                "subtotal": line_subtotal(quantity, unit_price),
                "source_type": source_type,
            }
        ).execute()
        return

    existing = rows[0]
    merged = existing["quantity"] + quantity
    _reject_over_limit(existing["quantity"], quantity)
    price = money(existing["unit_price"])   # 기존 행의 스냅샷 가격을 유지한다.
    supabase.table("order_item").update(
        {
            "quantity": merged,
            "subtotal": line_subtotal(merged, price),
            "source_type": source_type,
        }
    ).eq("order_item_id", existing["order_item_id"]).execute()


def set_item_quantity(item: dict, quantity: int) -> None:
    '''
    수량 변경 (FR-04). unit_price는 담을 때의 스냅샷을 그대로 쓴다.
    '''
    price = money(item["unit_price"])
    get_supabase().table("order_item").update(
        {
            "quantity": quantity,
            "subtotal": line_subtotal(quantity, price),
            "source_type": "STAFF_CORRECTED",
        }
    ).eq("order_item_id", item["order_item_id"]).execute()


def delete_item(order_item_id: int) -> None:
    get_supabase().table("order_item").delete().eq(
        "order_item_id", order_item_id).execute()


def replace_item_product(order_id: int, item: dict, new_product_id: int, quantity: int, store_id: int) -> None:
    """상품 재선택 (FR-05). 대상 상품이 이미 담겨 있으면 합산 후 원래 행을 지운다.

    합산 한도를 **지우기 전에** 확인한다. add_quantity가 99 초과에서 400을 던지는데,
    삭제가 이미 커밋된 뒤에 던지면 항목만 사라지고 orders 금액은 옛 값 그대로 남는다.
    그 상태의 주문은 gross_amount와 항목 합계가 어긋나 pay_order가 AMOUNT_STALE로
    거부한다 - 화면을 새로고침해도 풀리지 않는 막다른 길이 된다.
    """
    unit_price = load_store_price(new_product_id, store_id)
    ensure_merge_within_limit(order_id, new_product_id, quantity, exclude_item_id=item["order_item_id"])
    delete_item(item["order_item_id"])
    add_quantity(order_id, new_product_id, quantity,
                 unit_price, "STAFF_CORRECTED")


def save_manual_discount(order: dict, amounts: Amounts, reason: str | None, staff_id: int) -> dict:
    '''
    수동 할인과 금액 6종을 한 번의 UPDATE로 저장한다 (FR-08).

    금액을 나눠 쓰면 안 된다. orders 행의 CHECK 제약이
    discount_amount = membership + manual, total = gross - discount 를 검사하므로
    manual만 먼저 쓰는 순간 항등식이 깨져 저장이 거부된다.
    '''
    columns: dict = {
        **amounts.as_order_columns(),
        "manual_discount_reason": reason if amounts.manual_discount_amount > 0 else None,
        "manual_discount_staff_id": staff_id if amounts.manual_discount_amount > 0 else None,
    }
    get_supabase().table("orders").update(columns).eq(
        "order_id", order["order_id"]).execute()
    return {**order, **columns}


def cancel_order(order: dict) -> dict:
    ''' 
    계산 취소 (FR-09). PENDING 에서만 호출된다 - 재고는 차감된 적이 없다.
    '''
    columns = {"status": "CANCELLED"}
    get_supabase().table("orders").update(columns).eq(
        "order_id", order["order_id"]).execute()
    return {**order, **columns}


_MEMBER_SELECT = (
    "member_id, name, grade_id,"
    " membership_grade(grade_code, grade_name, discount_rate, point_earn_rate)"
)




def load_member_by_phone(phone: str) -> dict:
    """휴대폰번호로 회원 조회 (FR-18). 미등록이면 404."""
    rows = (
        get_supabase()
        .table("member")
        .select(_MEMBER_SELECT)
        .in_("phone", phone_variants(phone))
        .eq("is_active", True)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "일치하는 회원을 찾을 수 없습니다")
    return rows[0]


def member_rates(member: dict | None) -> tuple[Decimal, Decimal]:
    """회원 행에서 (등급 할인율, 적립률). 비회원이면 (0, 0)."""
    if member is None:
        return Decimal("0"), Decimal("0")
    grade = _embedded(member.get("membership_grade")) or {}
    return (
        Decimal(str(grade.get("discount_rate", 0))),
        Decimal(str(grade.get("point_earn_rate", 0))),
    )


def save_member_link(order: dict, member: dict | None, amounts: Amounts) -> dict:
    """회원 연결/해제와 금액 6종을 한 번의 UPDATE로 저장한다 (FR-18).

    applied_grade_id는 결제 시점 등급의 스냅샷이다. 회원 등급이 나중에 바뀌어도
    이 주문의 할인율은 변하지 않아야 하기 때문이다 (schemas/orders.py Order 주석).
    """
    columns: dict = {
        **amounts.as_order_columns(),
        "member_id": member["member_id"] if member else None,
        "applied_grade_id": member["grade_id"] if member else None,
    }
    get_supabase().table("orders").update(columns).eq(
        "order_id", order["order_id"]).execute()
    # order_detail이 order["member"] 임베드를 읽으므로 메모리에도 반영한다.
    return {**order, **columns, "member": member}


ORDER_LIST_SELECT = (
    "order_id, ordered_at, paid_at, member_id, gross_amount, discount_amount,"
    " total_amount, point_earned,"
    " order_item(quantity, product(product_name))"
)


def order_list_item(row: dict) -> OrderListItem:
    """조인 결과 1행을 목록 응답 1건으로 평탄화한다. DB를 타지 않는다."""
    items = row.get("order_item") or []
    names = [
        (_embedded(it.get("product")) or {}).get("product_name", "")
        for it in items
    ]
    return OrderListItem(
        order_id=row["order_id"],
        ordered_at=row["ordered_at"],
        paid_at=row["paid_at"],
        item_count=sum(int(it["quantity"]) for it in items),
        item_summary=item_summary([n for n in names if n]),
        gross_amount=money(row["gross_amount"]),
        discount_amount=money(row["discount_amount"]),
        total_amount=money(row["total_amount"]),
        member_applied=row.get("member_id") is not None,
        point_earned=row["point_earned"],
    )


# __________ 목록 조회 범위 · 기간 집계 __________

# "이 매장의 / 이 기간의 / 이 상태인 주문"이라는 조건은 목록과 summary가 **반드시**
# 똑같아야 한다. 어긋나면 "총 95건인데 매출은 80건분"처럼 화면에서만 티가 나는
# 종류의 버그가 된다. 그래서 조건을 한 곳에서만 조립한다.
def order_scope(
    *,
    store_id: int,
    rng: DateRange,
    paid_only: bool,
    select: str,
    count: str | None = None,
):
    """기간·매장·상태 필터가 걸린 orders 쿼리 빌더를 만든다.

    완성된 쿼리가 아니라 빌더를 돌려주는 이유: 호출부가 .order()/.range()를
    이어 붙여야 하고, PostgREST 빌더는 execute() 후 재사용할 수 없기 때문이다.
    """
    query = (
        get_supabase()
        .table("orders")
        .select(select, count=count)
        .eq("store_id", store_id)
        .gte("ordered_at", rng.start_utc.isoformat())
        .lt("ordered_at", rng.end_utc_exclusive.isoformat())
    )
    return query.eq("status", "PAID") if paid_only else query


SUMMARY_RPC = "order_summary"

# PostgREST가 "그런 함수 없다"고 답할 때의 신호들.
# PGRST202 = 스키마 캐시에 함수가 없음, 42883 = Postgres의 undefined_function.
_MISSING_FUNCTION_CODES = {"PGRST202", "42883"}
_MISSING_FUNCTION_HINT = "could not find the function"


def _is_missing_function(exc: APIError) -> bool:
    """db/19_order_summary.sql 미적용 상황인지 판별한다.

    다른 DB 오류(권한, 타입 불일치 등)까지 폴백으로 삼키면 성능 문제가 조용히
    숨어버리므로, '함수 없음'만 좁게 잡는다.
    """
    code = str(getattr(exc, "code", "") or "")
    message = str(getattr(exc, "message", "") or "").lower()
    return code in _MISSING_FUNCTION_CODES or _MISSING_FUNCTION_HINT in message


def _summary_by_scan(*, store_id: int, rng: DateRange, paid_only: bool) -> OrderSummary:
    """RPC가 없을 때의 폴백. 기간 전체를 읽어 파이썬으로 합산한다.

    fetch_all을 쓰는 이유: 범위를 주지 않으면 PostgREST가 1000행에서 조용히 자른다.
    total은 count='exact'라 정확한데 summary만 1000건분으로 계산돼, 30일 조회에서
    "총 2,792건"과 "매출 1,607만원"이 나란히 표시된 적이 있다.
    """
    rows = fetch_all(
        lambda: order_scope(
            store_id=store_id,
            rng=rng,
            paid_only=paid_only,
            select="total_amount, order_item(quantity)",
        ),
        order_by="order_id",
    )
    # 행마다 반올림해서 더하면 안 된다. SQL 함수는 numeric으로 다 더한 뒤 한 번
    # 반올림하고, 파이썬 round()는 은행가 반올림이라 결과가 갈린다.
    # (1000.50 세 건 -> 파이썬 3000, Postgres 3002. 실측으로 확인했다.)
    # 지금은 모든 금액이 정수라 차이가 없지만, 원 단위 미만이 생기는 순간 갈린다.
    # 시작값을 Decimal("0")으로 주는 이유: 행이 하나도 없으면 sum()이 int 0을 돌려주고
    # int에는 quantize가 없어 500이 난다. 폴백은 "함수가 아직 없는 환경"용이라
    # 시드 전 빈 매장에서 가장 먼저 밟히는 경로다.
    total = sum((Decimal(str(row["total_amount"])) for row in rows), Decimal("0"))
    return OrderSummary(
        sales_amount=int(total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)),
        order_count=len(rows),
        item_qty=sum(
            int(item["quantity"]) for row in rows for item in (row.get("order_item") or [])
        ),
    )


def load_order_summary(*, store_id: int, rng: DateRange, paid_only: bool) -> OrderSummary:
    """조회 기간 전체의 매출·건수·수량 (API명세서 4.5).

    DB 함수 한 번으로 끝내고, 함수가 아직 적용되지 않은 환경에서만 폴백한다.
    폴백은 결과가 같지만 느리다 - 경고 로그를 남겨 마이그레이션을 잊지 않게 한다.
    """
    try:
        data = (
            get_supabase()
            .rpc(
                SUMMARY_RPC,
                {
                    "p_store_id": store_id,
                    "p_from": rng.start_utc.isoformat(),
                    "p_to": rng.end_utc_exclusive.isoformat(),
                    "p_paid_only": paid_only,
                },
            )
            .execute()
        ).data
    except APIError as exc:
        if not _is_missing_function(exc):
            raise
        logger.warning(
            "orders.summary_rpc_missing",
            rpc=SUMMARY_RPC,
            hint="db/19_order_summary.sql 을 Supabase에 적용할 것. 지금은 느린 폴백으로 응답한다.",
        )
        return _summary_by_scan(store_id=store_id, rng=rng, paid_only=paid_only)

    return OrderSummary(
        sales_amount=int(data["sales_amount"]),
        order_count=int(data["order_count"]),
        item_qty=int(data["item_qty"]),
    )
