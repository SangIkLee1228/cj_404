"""KST 기준 기간 계산 유틸 (API명세서 v1.3 · 1.2, DB설계서 v2.2 · 8장).

저장은 항상 UTC, 화면 표시·집계 경계(오늘/이번주 등)는 Asia/Seoul(KST) 기준이라는
원칙을 dashboard·stats 라우트가 동일하게 따라야 해서 한 곳에 모은다.

zoneinfo.ZoneInfo("Asia/Seoul")는 시스템에 IANA tzdata가 없으면(Windows 기본 환경 등)
ZoneInfoNotFoundError를 던진다. 한국은 서머타임이 없어 연중 UTC+9 고정이므로
외부 tzdata 의존 없이 고정 오프셋으로 처리한다.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta, timezone

KST = timezone(timedelta(hours=9))


@dataclass(frozen=True)
class DateRange:
    """KST 기준 [start_date, end_date] 양끝 포함 날짜 범위."""

    start_date: date
    end_date: date

    @property
    def start_utc(self) -> datetime:
        return datetime.combine(self.start_date, time.min, tzinfo=KST).astimezone(UTC)

    @property
    def end_utc_exclusive(self) -> datetime:
        """end_date 다음날 00:00 KST 직전까지 → UTC 기준 배타적 상한."""
        return datetime.combine(self.end_date + timedelta(days=1), time.min, tzinfo=KST).astimezone(UTC)

    @property
    def days(self) -> int:
        return (self.end_date - self.start_date).days + 1


def kst_today() -> date:
    return datetime.now(KST).date()


def resolve_period(
    period: str,
    date_from: date | None = None,
    date_to: date | None = None,
) -> DateRange:
    """`period=TODAY|7D|30D` 또는 명시적 date_from/date_to를 KST 날짜 범위로 바꾼다.

    date_from/date_to가 하나라도 주어지면 period는 무시한다(API명세서 4.5 GET /orders와 동일 규칙).
    """
    if date_from is not None or date_to is not None:
        start = date_from or date_to
        end = date_to or date_from
        assert start is not None and end is not None
        return DateRange(start_date=start, end_date=end)

    today = kst_today()
    if period == "TODAY":
        return DateRange(start_date=today, end_date=today)
    if period == "7D":
        return DateRange(start_date=today - timedelta(days=6), end_date=today)
    if period == "30D":
        return DateRange(start_date=today - timedelta(days=29), end_date=today)
    raise ValueError(f"unknown period: {period}")


def previous_period(rng: DateRange) -> DateRange:
    """비교용 직전 동일 길이 기간 (예: 최근 7일 대비 그 이전 7일)."""
    length = rng.days
    return DateRange(
        start_date=rng.start_date - timedelta(days=length),
        end_date=rng.start_date - timedelta(days=1),
    )


def to_kst(dt: datetime) -> datetime:
    return dt.astimezone(KST)
