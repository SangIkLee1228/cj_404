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
from decimal import ROUND_FLOOR, Decimal  # 명세서 1.5가 floor를 명시 → 반올림 아님

import structlog  # 기존 코드가 쓰는 로거. print/logging 대신 통일
from fastapi import HTTPException, status

from app.core.deps import StaffContext
from app.core.supabase_client import get_supabase

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
    " product(product_name)"
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

    get_supabase().table("orders").update(columns).eq("order_id", order_id).execute()

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
        return Decimal("0"), Decimal("o")

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
