"""화면에 그대로 나가는 문자열을 만드는 곳.

같은 문구 규칙을 두 곳에서 따로 구현하면 한쪽만 바뀌어도 아무도 모른다.
운영 현황의 "최근 판매"와 판매 내역 목록은 같은 줄을 보여주므로 규칙도 하나여야 한다.
"""

import re


def item_summary(product_names: list[str]) -> str:
    """'카라멜 크림빵, 소금빵 외 1' 패턴 (API명세서 v1.3 · 4.5).

    앞의 2건만 이름으로 보여주고 나머지는 개수로 접는다. 목록 한 줄에 들어가야 해서다.
    """
    if not product_names:
        return ""
    if len(product_names) <= 2:
        return ", ".join(product_names)
    return f"{', '.join(product_names[:2])} 외 {len(product_names) - 2}"


def phone_variants(phone: str) -> list[str]:
    """휴대폰번호를 하이픈 있는 형태와 없는 형태 둘 다로 만든다.

    왜 필요한가: 명세서 4.6은 `01012345678`을 쓰는데 실제 MEMBER.phone에는
    `010-5506-5012`처럼 하이픈이 들어가 있다. 한쪽만 조회하면 정상 회원이 항상
    404가 된다. 저장 형식을 통일하는 마이그레이션 전까지는 양쪽을 모두 시도한다.

    11자리(010-XXXX-XXXX)와 10자리(011-XXX-XXXX)만 하이픈 형태를 만든다.
    그 밖의 자리수는 임의로 쪼개면 오히려 못 찾으므로 숫자만 시도한다.
    """
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return []
    variants = [digits]
    if len(digits) == 11:            # 010-5506-5012
        variants.append(f"{digits[:3]}-{digits[3:7]}-{digits[7:]}")
    elif len(digits) == 10:          # 011-234-5678 (구 번호대)
        variants.append(f"{digits[:3]}-{digits[3:6]}-{digits[6:]}")
    return variants
