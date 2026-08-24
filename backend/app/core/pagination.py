from dataclasses import dataclass
from typing import Any

from fastapi import Query


@dataclass(frozen=True)
class Page:
    limit: int
    offset: int

    @property
    def bounds(self) -> tuple[int, int]:
        """PostgREST `.range(start, end)`에 넘길 0-기반 포함 구간."""
        return self.offset, self.offset + self.limit - 1


def get_page(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page:
    return Page(limit=limit, offset=offset)


def paged(items: list, total: int | None, page: Page, **extra: Any) -> dict:
    """목록 응답 공통 규약 (API 명세서 1.3).

    `items`·`total`·`limit`·`offset`은 모든 목록 응답에 항상 포함한다.
    `summary`·`unread_count` 등 부가 집계는 `**extra`로 같은 레벨에 덧붙인다.

    `total`이 None이면(= count를 조회하지 않은 경우) 현재 페이지 길이로 대체한다.
    """
    body: dict[str, Any] = {
        "items": items,
        "total": len(items) if total is None else total,
        "limit": page.limit,
        "offset": page.offset,
    }
    body.update(extra)
    return body
