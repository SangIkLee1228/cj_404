"""화면에 그대로 나가는 문자열을 만드는 곳.

같은 문구 규칙을 두 곳에서 따로 구현하면 한쪽만 바뀌어도 아무도 모른다.
운영 현황의 "최근 판매"와 판매 내역 목록은 같은 줄을 보여주므로 규칙도 하나여야 한다.
"""


def item_summary(product_names: list[str]) -> str:
    """'카라멜 크림빵, 소금빵 외 1' 패턴 (API명세서 v1.3 · 4.5).

    앞의 2건만 이름으로 보여주고 나머지는 개수로 접는다. 목록 한 줄에 들어가야 해서다.
    """
    if not product_names:
        return ""
    if len(product_names) <= 2:
        return ", ".join(product_names)
    return f"{', '.join(product_names[:2])} 외 {len(product_names) - 2}"
