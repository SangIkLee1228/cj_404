from collections.abc import Callable
from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from app.core.config import get_settings

# PostgREST는 요청에 범위가 없으면 최대 1000행만 돌려준다. 문제는 **잘렸다는 사실을
# 어디에도 알리지 않는다**는 것이다 - 응답은 200이고, 30일치 통계가 9일치로 잘려도
# 화면에는 그냥 "매출이 적네"로 보인다. 실제로 그렇게 새어나간 적이 있다.
_FETCH_PAGE_SIZE = 1000


@lru_cache
def get_supabase() -> Client:
    """Service-role client for server-side DB/Storage access. Bypasses RLS - never expose this key to the frontend."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def fetch_all(
    build_query: Callable[[], Any], order_by: str, page_size: int = _FETCH_PAGE_SIZE
) -> list[dict]:
    """조건에 맞는 행을 1000행 상한에 걸리지 않고 끝까지 읽는다.

    `build_query`가 완성된 쿼리가 아니라 **쿼리를 만드는 함수**인 이유: PostgREST
    빌더는 execute() 후 재사용할 수 없어 페이지마다 새로 만들어야 한다.

    `order_by`는 페이지 경계를 안정시키기 위한 것이다. 정렬이 없으면 Postgres가
    페이지마다 다른 순서로 돌려줄 수 있어 어떤 행은 두 번 실리고 어떤 행은 누락된다.
    PK처럼 유일하고 불변인 컬럼을 넘길 것.
    """
    rows: list[dict] = []
    offset = 0

    while True:
        page = (
            build_query().order(order_by).range(offset, offset + page_size - 1).execute().data
        )
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += page_size
