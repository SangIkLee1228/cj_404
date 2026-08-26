"""GET /stats/sales - items와 summary가 같은 행에서 나오는지 검증.

원래 버그: _order_summary()가 매출·건수는 ORDERS에서, item_qty는 SALES_STAT_DAILY에서
가져왔다. 두 테이블의 적재 시점이 달라 한 응답 안에서 "매출 152만원인데 판매수량
9,030개" 같은 값이 나갔다. 사람이 눈으로 보기 전까지 아무도 몰랐다.

DB를 띄우지 않는다. 집계 함수에 행을 직접 먹인다.
"""

from datetime import date

import pytest

from app.api.routes import stats
from app.core.timeutil import DateRange

RNG = DateRange(start_date=date(2026, 8, 20), end_date=date(2026, 8, 26))


def _row(product_id, name, category, stat_date, sold_qty, sales_amount):
    """SALES_STAT_DAILY 한 행 + PRODUCT 임베딩 (stats._SELECT 모양)."""
    return {
        "product_id": product_id,
        "stat_date": stat_date,
        "sold_qty": sold_qty,
        "sales_amount": sales_amount,
        "product": {"product_name": name, "category": category, "product_type": "BREAD"},
    }


ROWS = [
    _row(9, "소금빵", "간식빵", "2026-08-25", 10, 22000),
    _row(9, "소금빵", "간식빵", "2026-08-26", 5, 11000),
    _row(10, "카마베르 치즈빵", "간식빵", "2026-08-25", 3, 9600),
    _row(31, "밤식빵", "식빵", "2026-08-26", 7, 33600),
]

TOTAL_QTY = 25
TOTAL_AMOUNT = 76200


@pytest.fixture
def fixed_order_count(monkeypatch):
    """order_count만 ORDERS를 보므로 그 부분만 고정한다."""
    monkeypatch.setattr(stats, "_order_count", lambda store_id, rng: 7)


@pytest.mark.parametrize("group_by", ["PRODUCT", "CATEGORY", "DAY"])
def test_summary_matches_the_sum_of_items(fixed_order_count, group_by):
    """어떤 group_by로 접든 items 합계와 summary가 같아야 한다."""
    grouped = stats._aggregate(ROWS, group_by)
    summary = stats._summary(ROWS, store_id=1, rng=RNG)

    assert summary.sales_amount == sum(b["sales_amount"] for b in grouped.values())
    assert summary.item_qty == sum(b["sold_qty"] for b in grouped.values())


def test_summary_amount_and_qty_come_from_the_given_rows(fixed_order_count):
    """ORDERS가 아니라 넘겨준 SALES_STAT_DAILY 행에서 나와야 한다."""
    summary = stats._summary(ROWS, store_id=1, rng=RNG)

    assert summary.sales_amount == TOTAL_AMOUNT
    assert summary.item_qty == TOTAL_QTY


def test_only_order_count_comes_from_orders(fixed_order_count):
    """건수는 상품×일자 집계로 복원할 수 없다 - 한 주문의 상품 3종은 3행으로 흩어지고,
    같은 상품을 산 두 주문은 1행으로 합쳐지기 때문이다. 이 값만 ORDERS를 본다."""
    summary = stats._summary(ROWS, store_id=1, rng=RNG)

    assert summary.order_count == 7
    assert summary.order_count != len(ROWS)


def test_empty_period_is_zero_not_a_crash(fixed_order_count):
    summary = stats._summary([], store_id=1, rng=RNG)

    assert (summary.sales_amount, summary.item_qty) == (0, 0)


def test_aggregate_folds_a_product_sold_on_several_days_into_one_row():
    grouped = stats._aggregate(ROWS, "PRODUCT")

    assert len(grouped) == 3
    assert grouped[9]["sold_qty"] == 15        # 08-25의 10 + 08-26의 5
    assert grouped[9]["sales_amount"] == 33000


def test_aggregate_by_day_keeps_one_row_per_date():
    grouped = stats._aggregate(ROWS, "DAY")

    assert set(grouped) == {"2026-08-25", "2026-08-26"}
    assert grouped["2026-08-26"]["sold_qty"] == 12   # 소금빵 5 + 밤식빵 7
