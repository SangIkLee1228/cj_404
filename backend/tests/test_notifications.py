"""GET /notifications - severity 파생 규칙과 DB 필터가 같은 것을 고르는지 검증.

목업 알림 필터는 "재고 부족 / 매진"으로 갈리는데 DB의 notif_type은 STOCK_LOW
하나뿐이라 수량 스냅샷에서 파생한다. 그래서 규칙이 두 곳에 생겼다:

  _severity()             - 목록 각 행에 붙는 배지
  _apply_severity_filter() - 필터 눌렀을 때 DB에 거는 조건

한쪽만 고치면 "매진 필터를 눌렀는데 재고 부족 배지가 섞여 나오는" 상태가 된다.
예외도 안 나고 total만 조용히 어긋난다. 이 테스트가 그 짝을 묶어둔다.
"""

import pytest

from app.api.routes import notifications

ROWS = [
    {"notification_id": 1, "notif_type": "STOCK_LOW", "remaining_qty_snapshot": 0},
    {"notification_id": 2, "notif_type": "STOCK_LOW", "remaining_qty_snapshot": 4},
    {"notification_id": 3, "notif_type": "STOCK_LOW", "remaining_qty_snapshot": 2},
    {"notification_id": 4, "notif_type": "STOCK_LOW", "remaining_qty_snapshot": None},
    {"notification_id": 5, "notif_type": "SYSTEM", "remaining_qty_snapshot": None},
    {"notification_id": 6, "notif_type": "SYSTEM", "remaining_qty_snapshot": 3},
]


class _FakeFilter:
    """_apply_severity_filter가 거는 PostgREST 조건을 파이썬 술어로 기록한다.

    실제 DB 대신 이걸로 걸러본 결과가 _severity의 판정과 같은지 비교하는 것이
    이 파일의 핵심이다.
    """

    def __init__(self):
        self._predicates: list = []

    def eq(self, column, value):
        self._predicates.append(lambda r, c=column, v=value: r.get(c) == v)
        return self

    def neq(self, column, value):
        self._predicates.append(lambda r, c=column, v=value: r.get(c) != v)
        return self

    def lte(self, column, value):
        self._predicates.append(
            lambda r, c=column, v=value: r.get(c) is not None and r.get(c) <= v
        )
        return self

    def or_(self, expression):
        clauses = [self._clause(part) for part in expression.split(",")]
        self._predicates.append(lambda r, cs=clauses: any(c(r) for c in cs))
        return self

    @staticmethod
    def _clause(part: str):
        column, operator, value = part.split(".", 2)
        if operator == "gt":
            return lambda r, c=column, v=int(value): r.get(c) is not None and r.get(c) > v
        if operator == "is" and value == "null":
            return lambda r, c=column: r.get(c) is None
        raise AssertionError(f"테스트가 모르는 PostgREST 연산자다: {part!r}")

    def matches(self, row: dict) -> bool:
        return all(predicate(row) for predicate in self._predicates)


@pytest.mark.parametrize("severity", ["OUT", "LOW", "INFO"])
def test_db_filter_selects_exactly_what_severity_derives(severity):
    """필터가 고르는 집합 == 배지가 그 값인 집합. 이게 어긋나면 화면이 거짓말을 한다."""
    query = notifications._apply_severity_filter(_FakeFilter(), severity)

    selected = {r["notification_id"] for r in ROWS if query.matches(r)}
    derived = {r["notification_id"] for r in ROWS if notifications._severity(r) == severity}

    assert selected == derived


def test_three_severities_partition_every_row():
    """모든 알림은 정확히 하나의 severity에 속한다 - 빠지거나 겹치는 행이 없어야
    상단 카운트(매진 n · 재고 부족 n)의 합이 전체와 맞는다."""
    buckets = {
        severity: {
            r["notification_id"]
            for r in ROWS
            if r["notification_id"]
            in {
                x["notification_id"]
                for x in ROWS
                if notifications._apply_severity_filter(_FakeFilter(), severity).matches(x)
            }
        }
        for severity in ("OUT", "LOW", "INFO")
    }

    assert buckets["OUT"] | buckets["LOW"] | buckets["INFO"] == {r["notification_id"] for r in ROWS}
    assert not buckets["OUT"] & buckets["LOW"]
    assert not buckets["LOW"] & buckets["INFO"]
    assert not buckets["OUT"] & buckets["INFO"]


def test_sold_out_is_out_not_low():
    """잔여 0은 "재고 부족"이 아니라 "매진"이다. pay_order RPC는 이 경우에도
    notif_type='STOCK_LOW'로 넣으므로, 구분은 스냅샷 수량이 한다."""
    assert notifications._severity(ROWS[0]) == "OUT"


def test_remaining_stock_is_low():
    assert notifications._severity(ROWS[1]) == "LOW"
    assert notifications._severity(ROWS[2]) == "LOW"


def test_stock_alert_without_a_snapshot_is_low_not_out():
    """수량을 모를 뿐 매진은 아니다. 0과 NULL을 같이 취급하면 멀쩡한 상품이
    매진으로 뜬다."""
    assert notifications._severity(ROWS[3]) == "LOW"


def test_non_stock_alerts_are_info():
    assert notifications._severity(ROWS[4]) == "INFO"
    assert notifications._severity(ROWS[5]) == "INFO"
