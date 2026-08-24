from app.core.pagination import Page, paged


def test_page_bounds_is_inclusive_range():
    assert Page(limit=50, offset=0).bounds == (0, 49)
    assert Page(limit=20, offset=40).bounds == (40, 59)


def test_paged_always_includes_list_convention_fields():
    body = paged(["a", "b"], total=128, page=Page(limit=50, offset=0))
    assert body == {"items": ["a", "b"], "total": 128, "limit": 50, "offset": 0}


def test_paged_puts_extra_aggregates_at_top_level():
    body = paged([], total=0, page=Page(limit=50, offset=0), unread_count=3)
    assert body["unread_count"] == 3
    assert body["items"] == []


def test_paged_total_falls_back_to_item_count():
    assert paged(["a"], total=None, page=Page(limit=50, offset=0))["total"] == 1
