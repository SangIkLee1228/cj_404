from dataclasses import dataclass
from typing import Any

from fastapi import Query


@dataclass(frozen=True)
class Page:
    limit: int
    offset: int


@property
def bounds(self) -> tuple[int, int]:
    return self.offset, self.offset + self.limit - 1


def get_page(
        limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
) -> Page:
    return Page(limit=limit, offset=offset)


def paged(items: list, total: int | None, page: Page, **extra: Any) -> dict:
    body: dict[str, Any] = {}
