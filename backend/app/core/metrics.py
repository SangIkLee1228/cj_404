"""화면 공통 지표 계산.

대시보드 KPI(운영 현황)와 판매 통계가 같은 증감률 규칙을 쓰도록 한 곳에 둔다.
재고 상태 판정(_stock_status)을 재고/대시보드가 공유하는 것과 같은 이유다 -
두 화면이 같은 숫자를 다르게 계산하면 어느 쪽이 맞는지 알 수 없게 된다.
"""


def change_pct(current: int, previous: int) -> float:
    """직전 동일 길이 기간 대비 증감률(%). 소수 첫째 자리까지.

    직전이 0일 때는 비율이 정의되지 않는다. 지금 값이 있으면 +100.0, 둘 다 0이면 0.0으로
    돌려주므로 화면에서 이 조합을 "신규"로 표기해도 된다.
    """
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return round((current - previous) / previous * 100, 1)


def share_pct(part: int, whole: int) -> float:
    """전체 대비 비중(%). 목업 도넛 범례의 "68개 · 4.6%"용."""
    if whole <= 0:
        return 0.0
    return round(part / whole * 100, 1)
