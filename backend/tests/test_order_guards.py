"""주문 쓰기 경로의 가드 (app/services/orders.py).

여기 모인 세 가지는 전부 "조용히 틀리는" 종류의 버그를 막는다.
조용히 틀리면 화면에는 정상으로 보이고 장부만 어긋난다.
"""

import pytest
from fastapi import HTTPException

import app.services.orders as svc


class _Table:
    """PostgREST 빌더 흉내. 마지막 execute()가 돌려줄 값만 정한다."""

    def __init__(self, sink: dict, rows):
        self._sink, self._rows = sink, rows

    def select(self, *a, **k):
        return self

    def update(self, columns):
        self._sink["updated"] = columns
        return self

    def insert(self, row):
        self._sink["inserted"] = row
        return self

    def eq(self, col, val):
        self._sink.setdefault("filters", []).append((col, val))
        return self

    def limit(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


def _client(sink, rows):
    return type("C", (), {"table": lambda self, name: _Table(sink, rows)})()


# ── 수량 상한 ────────────────────────────────────────────────
def test_merging_past_99_raises_instead_of_silently_capping(monkeypatch):
    """예전에는 min()으로 잘랐다 - 105개를 담아도 99개 값만 받고 6개가 사라졌다."""
    sink: dict = {}
    monkeypatch.setattr(svc, "get_supabase", lambda: _client(
        sink, [{"order_item_id": 1, "quantity": 95, "unit_price": 2000}]))

    with pytest.raises(HTTPException) as caught:
        svc.add_quantity(1, 9, 10, 2000, "MANUAL_ADD")

    assert caught.value.status_code == 400
    assert "99" in caught.value.detail
    assert "updated" not in sink, "실패했는데 수량을 써버리면 안 된다"


def test_merging_within_99_still_works(monkeypatch):
    sink: dict = {}
    monkeypatch.setattr(svc, "get_supabase", lambda: _client(
        sink, [{"order_item_id": 1, "quantity": 3, "unit_price": 2000}]))

    svc.add_quantity(1, 9, 2, 2000, "MANUAL_ADD")
    assert sink["updated"]["quantity"] == 5
    assert sink["updated"]["subtotal"] == 10000


# ── 결제된 주문에 금액을 덮어쓰지 않는다 ──────────────────────
def _recalc_env(monkeypatch, updated_rows):
    sink: dict = {}
    monkeypatch.setattr(svc, "get_supabase", lambda: _client(sink, updated_rows))
    monkeypatch.setattr(svc, "load_items", lambda oid: [
        {"quantity": 1, "unit_price": 3200, "product_id": 9}])
    monkeypatch.setattr(svc, "load_point_earn_rate", lambda gid: 0)
    return sink


def test_recalculate_filters_on_pending(monkeypatch):
    """UPDATE에 status 조건이 붙어야 결제 직후의 덮어쓰기를 DB가 막아준다."""
    sink = _recalc_env(monkeypatch, [{"order_id": 1}])
    svc.recalculate({"order_id": 1, "manual_discount_amount": 0})
    assert ("status", "PENDING") in sink["filters"]


def test_recalculate_raises_when_no_row_matched(monkeypatch):
    """0행이 갱신됐다 = 그 사이 PAID/CANCELLED가 됐다. 성공한 척하면 안 된다."""
    _recalc_env(monkeypatch, [])
    with pytest.raises(HTTPException) as caught:
        svc.recalculate({"order_id": 1, "manual_discount_amount": 0})
    assert caught.value.status_code == 409


# ── 집계 반올림이 SQL과 같아야 한다 ───────────────────────────
def test_fallback_rounds_like_postgres(monkeypatch):
    """행마다 반올림하면 파이썬의 은행가 반올림 때문에 SQL과 갈린다.

    1000.50 세 건: 행별 반올림 -> 3000, 합계 후 반올림 -> 3002.
    실제 Postgres 16의 order_summary()가 3002를 돌려주는 것을 확인했다.
    """
    rows = [{"total_amount": "1000.50", "order_item": [{"quantity": 1}]} for _ in range(3)]
    monkeypatch.setattr(svc, "fetch_all", lambda build, order_by: rows)
    monkeypatch.setattr(svc, "order_scope", lambda **kw: None)

    from app.core.timeutil import resolve_period
    summary = svc._summary_by_scan(store_id=1, rng=resolve_period("TODAY"), paid_only=True)

    assert summary.sales_amount == 3002
    assert summary.order_count == 3
    assert summary.item_qty == 3


# ── 재선택은 지우기 전에 한도를 본다 ──────────────────────────
def test_replace_checks_limit_before_deleting(monkeypatch):
    """지운 뒤 400이 나면 항목만 사라지고 orders 금액은 옛 값으로 남는다.

    그 주문은 gross_amount와 항목 합계가 어긋나 pay_order가 AMOUNT_STALE로 거부하고,
    새로고침해도 풀리지 않는다. 그래서 삭제보다 검사가 먼저여야 한다.
    """
    ops: list[str] = []

    class _T:
        def __init__(self, name): self.name = name
        def select(self, *a, **k): return self
        def eq(self, *a, **k): return self
        def limit(self, *a, **k): return self
        def delete(self):
            ops.append(f"DELETE {self.name}")
            return self
        def execute(self):
            if self.name == "order_item":
                return type("R", (), {"data": [{"order_item_id": 9, "quantity": 97}]})()
            return type("R", (), {"data": []})()

    monkeypatch.setattr(svc, "get_supabase",
                        lambda: type("C", (), {"table": lambda self, n: _T(n)})())
    monkeypatch.setattr(svc, "load_store_price", lambda pid, sid: 3200)

    with pytest.raises(HTTPException) as caught:
        svc.replace_item_product(900, {"order_item_id": 1}, 3, 5, store_id=1)

    assert caught.value.status_code == 400
    assert "DELETE order_item" not in ops, f"검사 전에 지웠다: {ops}"


def test_replace_ignores_the_row_it_is_about_to_delete(monkeypatch):
    """자기 자신을 합산 대상에 넣으면 멀쩡한 재선택이 400으로 막힌다."""
    rows = [{"order_item_id": 1, "quantity": 60}, {"order_item_id": 9, "quantity": 30}]

    class _T:
        def select(self, *a, **k): return self
        def eq(self, *a, **k): return self
        def execute(self): return type("R", (), {"data": rows})()

    monkeypatch.setattr(svc, "get_supabase",
                        lambda: type("C", (), {"table": lambda self, n: _T()})())

    # 자기(60)를 빼면 30 + 30 = 60 -> 통과해야 한다
    svc.ensure_merge_within_limit(900, 3, 30, exclude_item_id=1)

    # 빼지 않으면 90 + 30 = 120 -> 막힌다
    with pytest.raises(HTTPException):
        svc.ensure_merge_within_limit(900, 3, 30)
