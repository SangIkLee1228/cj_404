"""주문 금액 계산 검증 (API명세서 v1.3 · 1.5).

이 파일은 DB도 앱도 띄우지 않는다. compute_amounts가 순수 함수라서 가능하다.
다른 테스트들이 "토큰 없으면 401"만 확인하는 것과 달리, 여기서는 실제 계산 결과를 본다.
"""

import math  # float의 실제 동작을 대조하는 테스트에서만 쓴다
from decimal import Decimal

from app.services.orders import Amounts, compute_amounts, line_subtotal, money, order_detail

#    └ pyproject.toml의 pythonpath = ["."] 덕분에 backend/ 기준 절대경로로 import된다.
#      pytest가 tests/ 안에서 실행돼도 app 패키지를 찾는 이유.

FAMILY_DISCOUNT_RATE = Decimal("0.0100")
POINT_EARN_RATE = Decimal("0.0050")
# └ 매직넘버를 테스트 본문에 흩뿌리지 않는다. 등급 비율이 바뀌면 여기 두 줄만 고치면 된다.
#   Decimal("0.0100") 처럼 문자열로 쓰는 게 중요 — Decimal(0.01)은 float 오차를 물려받는다.


def test_money_accepts_both_string_and_float():
    #   └ pytest는 test_ 로 시작하는 함수를 자동으로 찾아 실행한다. 등록 절차가 따로 없다.
    assert money("2200.00") == 2200   # PostgREST가 문자열로 줄 때
    assert money(2200.0) == 2200      # float으로 줄 때
#   └ assert 만 쓴다. unittest의 self.assertEqual 같은 게 필요 없고,
#     실패하면 pytest가 좌우 값을 알아서 풀어서 보여준다.


def test_line_subtotal():
    assert line_subtotal(quantity=3, unit_price=2200) == 6600
#                        └ 키워드로 호출한 이유: (3, 2200)과 (2200, 3)이 둘 다 통과하는
#                          함수라 순서를 바꿔 써도 테스트가 안 잡는다. 이름을 붙여야 의미가 남는다.


def test_gross_is_sum_of_lines():
    items = [
        {"quantity": 1, "unit_price": "3200.00"},   # 카망베르 치즈빵
        {"quantity": 2, "unit_price": "2200.00"},   # 소금빵 2개 — 수량이 곱해지는지 확인용
        {"quantity": 1, "unit_price": "3500.00"},
    ]
#   └ unit_price를 일부러 문자열로 뒀다. Supabase 응답 모양 그대로다.
#     테스트에서 int로 편하게 쓰면 실제 운영에서만 터지는 코드가 된다.
    amounts = compute_amounts(items)
    assert amounts.gross_amount == 11100          # 3200 + 4400 + 3500
    assert amounts.discount_amount == 0
    assert amounts.total_amount == 11100
    assert amounts.point_earned == 0
#   └ 회원을 안 붙였을 때 할인·적립이 0으로 떨어지는지까지 본다.
#     기본값이 Decimal("0")인데 실수로 None이 되면 여기서 잡힌다.


def test_matches_spec_example_exactly():
    """
    명세서 4.5의 예시 응답 숫자를 그대로 재현한다.
    gross 11100 -> 1% 할인 111 -> total 10989 -> 0.5% 적립 54.
    적립이 54인 것이 중요하다. 10989 * 0.005 = 54.945 이므로 반올림이면 55가 되고, 명세서가 지정한 floor여야 54가 된다.
    """
    items = [{"quantity": 1, "unit_price": "11100.00"}]
    amounts = compute_amounts(
        items,
        discount_rate=FAMILY_DISCOUNT_RATE,
        point_earn_rate=POINT_EARN_RATE,
    )
    assert amounts == Amounts(
        gross_amount=11100,
        membership_discount_amount=111,
        manual_discount_amount=0,
        discount_amount=111,
        total_amount=10989,
        point_earned=54,
    )


def test_decimal_holds_at_rates_where_float_floor_breaks():
    """현재 비율(1%·0.5%)에서는 float도 같은 답을 낸다. 비율이 바뀌면 달라진다.

    rate=0.0029, gross=10000 -> float은 28.999999999999996이라 내림 시 28,
    Decimal은 29. 등급 비율이 조정되는 순간 조용히 1이 어긋나는 지점을 고정해둔다.
    """
    assert math.floor(10000 * 0.0029) == 28  # float의 실제 동작
    amounts = compute_amounts(
        [{"quantity": 1, "unit_price": 10000}], discount_rate=Decimal("0.0029")
    )
    assert amounts.membership_discount_amount == 29


def test_float_rate_does_not_leak_its_error_into_decimal():
    """Supabase가 비율을 float으로 돌려줘도 결과가 같아야 한다.

    Decimal(0.0029)는 float 오차를 물려받아 0.002899999...가 된다.
    _floor_rate가 str()을 거치지 않으면 이 테스트가 28로 떨어진다.
    """
    assert compute_amounts(
        [{"quantity": 1, "unit_price": 10000}], discount_rate=0.0029
    ).membership_discount_amount == 29


def test_point_is_earned_on_total_not_gross():
    # 할인 후 금액 기준이어야 한다. gross 기준이면 할인받고 적립까지 더 받는 구조가 된다.
    amounts = compute_amounts(
        [{"quantity": 1, "unit_price": 10000}],
        discount_rate=Decimal("0.0100"),
        point_earn_rate=POINT_EARN_RATE,
    )
    assert amounts.total_amount == 9900
    # floor(9900 * 0.005) = 49, gross 기준이면 50
    assert amounts.point_earned == 49


def test_manual_discount_is_added_to_membership_discount():
    amounts = compute_amounts(
        [{"quantity": 1, "unit_price": 10000}],
        discount_rate=Decimal("0.0100"),
        manual_discount_amount=500,
    )
    assert amounts.membership_discount_amount == 100
    assert amounts.manual_discount_amount == 500
    assert amounts.discount_amount == 600
    assert amounts.total_amount == 9400


def test_manual_discount_is_clamped_when_items_shrink_below_it():
    """500원 할인을 걸어둔 주문에서 항목이 줄어 gross가 300이 된 상황.

    total이 음수가 되면 orders 행 저장이 거부되므로 할인을 깎아서 0으로 맞춘다.
    """
    amounts = compute_amounts(
        [{"quantity": 1, "unit_price": 300}], manual_discount_amount=500
    )
    assert amounts.manual_discount_amount == 300
    assert amounts.total_amount == 0


def test_empty_order_is_all_zero():
    # 항목을 전부 지운 PENDING 주문. 0으로 떨어져야 다음 계산이 정상 시작된다.
    amounts = compute_amounts([], discount_rate=FAMILY_DISCOUNT_RATE)
    assert amounts.gross_amount == 0
    assert amounts.total_amount == 0


def test_as_order_columns_covers_every_amount_column():
    amounts = compute_amounts([{"quantity": 2, "unit_price": 1500}])
    assert amounts.as_order_columns() == {
        "gross_amount": 3000,
        "membership_discount_amount": 0,
        "manual_discount_amount": 0,
        "discount_amount": 0,
        "total_amount": 3000,
        "point_earned": 0,
    }
#   └ UPDATE에 넘길 dict의 키 이름을 통째로 고정. 오타가 나면 즉시 실패한다.


# ------------------ 08.25 ---------------------
def _order_row(**overrides):
    row = {
        "order_id": 120, "status": "PENDING", "ordered_at": "2026-08-25T09:12:30+00:00",
        "paid_at": None, "payment_method": None,
        "gross_amount": "11100.00", "membership_discount_amount": "111.00",
        "manual_discount_amount": "0.00", "discount_amount": "111.00",
        "total_amount": "10989.00", "point_earned": 54, "point_used": 0,
        "member": None,
    }
    return {**row, **overrides}


def test_order_detail_converts_decimal_strings_to_int():
    detail = order_detail(_order_row(), [])
    assert detail.gross_amount == 11100
    assert detail.total_amount == 10989
    assert detail.items == []


def test_order_detail_masks_member_name():
    """원본 이름이 응답에 절대 실리면 안 된다 (NFR-06)."""
    order = _order_row(
        member={"member_id": 7, "name": "한지원",
                "membership_grade": {"grade_code": "FAMILY", "grade_name": "패밀리"}}
    )
    detail = order_detail(order, [])
    assert detail.member.name == "한*원"
    assert detail.member.grade_code == "FAMILY"


def test_order_detail_handles_embedded_list_form():
    """PostgREST가 1:1 관계를 리스트로 돌려줘도 깨지지 않아야 한다."""
    order = _order_row(
        member=[{"member_id": 7, "name": "한지원",
                 "membership_grade": [{"grade_code": "VIP"}]}]
    )
    assert order_detail(order, []).member.grade_code == "VIP"


def test_order_detail_flattens_item_product_name():
    items = [{
        "order_item_id": 501, "product_id": 10, "quantity": 2,
        "unit_price": "3200.00", "subtotal": "6400.00",
        "source_type": "AI_DETECTED", "product": {"product_name": "카망베르 치즈빵"},
    }]
    item = order_detail(_order_row(), items).items[0]
    assert item.product_name == "카망베르 치즈빵"
    assert item.subtotal == 6400
