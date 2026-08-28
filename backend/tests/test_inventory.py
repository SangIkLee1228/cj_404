"""재고 상태 판정 - pay_order RPC와 같은 기준으로 움직이는지 검증.

재고 화면의 "재고 부족" 배지와 결제 시 발생하는 매진임박 알림은 같은 기준선을
써야 한다. 한쪽만 어긋나면 "알림은 안 왔는데 화면은 부족이라고 한다"가 된다.

이 판정 함수들은 대시보드의 "지금 채워야 할 빵"도 그대로 쓴다(dashboard.py가
_stock_status/_remaining_pct/_baseline_map을 import한다). 한 곳을 고치면 두 화면이
같이 움직이는 것이 의도다.
"""

from types import SimpleNamespace

from app.api.routes import inventory


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self._rows)


class _FakeSupabase:
    def __init__(self, rows):
        self._rows = rows

    def table(self, name):
        return _FakeQuery(self._rows)


def test_baseline_zero_is_not_replaced_by_the_default(monkeypatch):
    """`or 20`을 쓰면 stock_baseline_pct=0("이 상품은 알리지 마라")이 20으로 뒤집힌다.

    pay_order RPC는 coalesce라 0을 그대로 쓰므로, 그 상태에서는 알림은 안 나가는데
    재고 화면만 "재고 부족"으로 뜬다. 실제로 있었던 버그다.
    """
    rows = [
        {"product_id": 1, "stock_baseline_pct": 0},
        {"product_id": 2, "stock_baseline_pct": None},
        {"product_id": 3, "stock_baseline_pct": 10},
    ]
    monkeypatch.setattr(inventory, "get_supabase", lambda: _FakeSupabase(rows))

    assert inventory._baseline_map(store_id=1) == {1: 0, 2: 20, 3: 10}


def test_baseline_zero_means_only_sold_out_is_flagged(monkeypatch):
    """기준선 0이면 잔여가 남아 있는 한 LOW가 되지 않는다."""
    assert inventory._stock_status(1, remaining_pct=1.0, baseline_pct=0) == "OK"
    assert inventory._stock_status(0, remaining_pct=0.0, baseline_pct=0) == "OUT"


def test_zero_remaining_is_out_even_when_below_baseline():
    """매진은 재고 부족보다 우선한다 - 목업 필터가 둘을 다르게 취급한다."""
    assert inventory._stock_status(0, remaining_pct=0.0, baseline_pct=10) == "OUT"


def test_exactly_at_the_baseline_counts_as_low():
    """경계값은 포함이다(<=). pay_order RPC도 <= 로 알림을 만든다."""
    assert inventory._stock_status(4, remaining_pct=10.0, baseline_pct=10) == "LOW"


def test_just_above_the_baseline_is_ok():
    assert inventory._stock_status(5, remaining_pct=12.5, baseline_pct=10) == "OK"


def test_remaining_pct_is_rounded_to_one_decimal():
    assert inventory._remaining_pct(remaining_qty=1, produced_qty=3) == 33.3


def test_nothing_produced_does_not_divide_by_zero():
    """생산 0이면 비율이 정의되지 않는다. 0으로 두고 remaining_qty가 상태를 정한다."""
    assert inventory._remaining_pct(remaining_qty=0, produced_qty=0) == 0.0
    assert inventory._stock_status(0, remaining_pct=0.0, baseline_pct=10) == "OUT"


def test_inactive_catalog_products_are_excluded_from_the_list(monkeypatch):
    """카탈로그에서 내린 상품(product.is_active=false)은 재고 표에 남으면 안 된다.

    INVENTORY 행은 상품을 내려도 그대로 남아 있어서, 필터가 없으면 S-10 상품 목록에는
    없는 상품이 재고 화면에만 계속 보인다("dashboard와 supabase 목록 불일치").
    product!inner 임베드라 임베드 컬럼 필터가 곧 조인 제외가 된다.
    """
    applied: list[tuple] = []

    class _RecordingQuery(_FakeQuery):
        def eq(self, *args, **kwargs):
            applied.append(args)
            return self

    class _RecordingSupabase:
        def table(self, name):
            return _RecordingQuery([])

    monkeypatch.setattr(inventory, "get_supabase", lambda: _RecordingSupabase())
    monkeypatch.setattr(inventory, "with_signed_images", lambda items: items)

    # 직접 호출이라 FastAPI가 기본값을 풀어주지 않는다 - Query 객체가 그대로
    # 넘어가면 truthy로 판정돼 엉뚱한 필터가 붙으므로 명시적으로 넘긴다.
    inventory.list_inventory(
        stock_status="ALL",
        q=None,
        product_type=None,
        category=None,
        limit=50,
        offset=0,
        staff=SimpleNamespace(store_id=1),
    )

    assert ("product.is_active", True) in applied
    # 임베드 컬럼 필터는 그 컬럼이 select 절에 있어야 PostgREST가 받아준다.
    assert "is_active" in inventory._SELECT
