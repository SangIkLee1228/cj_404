"""회원(CJ ONE) 조회 API (FR-18, API명세서 v1.3 · 4.6).

CJ ONE 실연동은 범위 밖(Mock 데이터) - 여기서는 휴대폰번호로 MEMBER를 조회해
결제 화면의 회원 연결/등급 할인 프리뷰에 필요한 최소 정보만 내려준다.
"""

import time
from collections import defaultdict

from fastapi import APIRouter, Depends, Query, status

from app.core.deps import StaffContext, get_staff_context
from app.core.errors import ApiError
from app.core.supabase_client import get_supabase
from app.schemas.common import MemberLookupResponse

router = APIRouter(prefix="/members", tags=["members"])

_SELECT = (
    "member_id, name, point_balance,"
    " membership_grade(grade_code, grade_name, discount_rate, point_earn_rate)"
)

# 휴대폰번호 무차별 조회 방지(API명세서 1.4 · 429 TOO_MANY_REQUESTS). 프로세스 내
# 슬라이딩 윈도우 카운터로 최소 구현한다 - 재배포/재시작 시 리셋되는 것은 MVP 범위로 받아들인다.
_RATE_LIMIT = 20
_RATE_WINDOW_SECONDS = 60.0
_lookup_calls: dict[int, list[float]] = defaultdict(list)


def _check_rate_limit(staff_id: int) -> None:
    now = time.monotonic()
    calls = _lookup_calls[staff_id]
    cutoff = now - _RATE_WINDOW_SECONDS
    while calls and calls[0] < cutoff:
        calls.pop(0)
    if len(calls) >= _RATE_LIMIT:
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "TOO_MANY_REQUESTS",
            "휴대폰번호 조회 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        )
    calls.append(now)


def _mask_name(name: str) -> str:
    """"정우현" → "정*현" 패턴 마스킹(DB설계서 v2.2 · 4.5 MEMBER.name 주석 기준)."""
    if len(name) <= 1:
        return name
    if len(name) == 2:
        return f"{name[0]}*"
    return f"{name[0]}{'*' * (len(name) - 2)}{name[-1]}"


def _flatten(row: dict) -> MemberLookupResponse:
    grade = row["membership_grade"]
    grade = grade[0] if isinstance(grade, list) else grade
    return MemberLookupResponse(
        member_id=row["member_id"],
        name=_mask_name(row["name"]),
        grade_code=grade["grade_code"],
        grade_name=grade["grade_name"],
        discount_rate=grade["discount_rate"],
        point_earn_rate=grade["point_earn_rate"],
        point_balance=row["point_balance"],
    )


@router.get("/lookup", response_model=MemberLookupResponse)
def lookup_member(
    phone: str = Query(..., min_length=1),
    staff: StaffContext = Depends(get_staff_context),
):
    """휴대폰번호로 CJ ONE 회원 조회. 매장 화면에서 결제 전 회원 연결에 쓴다."""
    _check_rate_limit(staff.staff_id)

    supabase = get_supabase()
    result = (
        supabase.table("member")
        .select(_SELECT)
        .eq("phone", phone)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise ApiError(
            status.HTTP_404_NOT_FOUND, "NOT_FOUND", "일치하는 회원을 찾을 수 없습니다"
        )
    return _flatten(result.data[0])
