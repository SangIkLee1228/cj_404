"""fetch_all - PostgREST 1000행 상한 회귀 테스트.

이 버그는 이번 프로젝트에서 세 번 나왔다(stats.py · dashboard.py · orders.py).
세 번 다 사람이 우연히 발견했다. PostgREST는 범위 없는 요청을 1000행에서 자르면서
예외도 경고도 내지 않기 때문에, 응답은 200이고 화면에는 "매출이 좀 적네"로만 보인다.
실제로 30일 매출이 실제의 29%로 보고되고 있었다.

DB를 띄우지 않는다. fetch_all이 페이지를 어떻게 넘기는지만 본다.
"""

from types import SimpleNamespace

from app.core.supabase_client import fetch_all


class _FakeQuery:
    """PostgREST 쿼리 빌더 흉내. .order().range().execute().data 체인만 지원한다."""

    def __init__(self, rows: list[dict], calls: list):
        self._rows = rows
        self._calls = calls
        self._order: str | None = None
        self._range: tuple[int, int] | None = None

    def order(self, column: str):
        self._order = column
        return self

    def range(self, start: int, end: int):
        self._range = (start, end)
        return self

    def execute(self):
        assert self._range is not None, "range() 없이 execute()하면 1000행에서 잘린다"
        start, end = self._range
        self._calls.append((self._order, start, end))
        return SimpleNamespace(data=self._rows[start : end + 1])


def _build(rows: list[dict], calls: list):
    """fetch_all은 완성된 쿼리가 아니라 쿼리를 만드는 함수를 받는다.
    PostgREST 빌더가 execute() 후 재사용되지 않기 때문이다."""
    return lambda: _FakeQuery(rows, calls)


def test_reads_every_row_past_the_1000_limit():
    """2,500행짜리 결과가 1,000행으로 잘리지 않아야 한다. 이게 실제로 샜던 버그다."""
    rows = [{"id": i} for i in range(2500)]
    calls: list = []

    result = fetch_all(_build(rows, calls), order_by="id")

    assert len(result) == 2500
    assert result == rows
    assert len(calls) == 3  # 1000 + 1000 + 500


def test_stops_when_a_page_comes_back_short():
    rows = [{"id": i} for i in range(150)]
    calls: list = []

    assert len(fetch_all(_build(rows, calls), order_by="id")) == 150
    assert len(calls) == 1  # 첫 페이지가 이미 짧으면 더 묻지 않는다


def test_asks_once_more_when_the_row_count_lands_exactly_on_a_page_boundary():
    """정확히 1000행이면 "더 있는지" 알 수 없으므로 한 번 더 물어야 한다."""
    rows = [{"id": i} for i in range(1000)]
    calls: list = []

    assert len(fetch_all(_build(rows, calls), order_by="id")) == 1000
    assert len(calls) == 2
    assert calls[1] == ("id", 1000, 1999)


def test_empty_result_is_a_single_call():
    calls: list = []
    assert fetch_all(_build([], calls), order_by="id") == []
    assert len(calls) == 1


def test_every_page_is_ordered_by_the_given_column():
    """정렬이 없으면 Postgres가 페이지마다 다른 순서를 돌려줄 수 있어
    어떤 행은 두 번 실리고 어떤 행은 누락된다."""
    rows = [{"id": i} for i in range(2500)]
    calls: list = []

    fetch_all(_build(rows, calls), order_by="stat_id")

    assert [column for column, _, _ in calls] == ["stat_id"] * 3


def test_pages_do_not_overlap_or_skip():
    rows = [{"id": i} for i in range(2500)]
    calls: list = []

    fetch_all(_build(rows, calls), order_by="id")

    bounds = [(start, end) for _, start, end in calls]
    assert bounds == [(0, 999), (1000, 1999), (2000, 2999)]


def test_page_size_is_configurable():
    rows = [{"id": i} for i in range(25)]
    calls: list = []

    assert len(fetch_all(_build(rows, calls), order_by="id", page_size=10)) == 25
    assert len(calls) == 3
