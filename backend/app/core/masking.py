'''
개인정보 마스킹 (NFR-06).

회원 이름은 서버에서만 가린다. 원본을 API로 내보낸 뒤 프런트가 가리는 방식은
네트워크 탭 / 로그 / 캐시에 원본이 그대로 남아 마스킹이 아니다.
'''


def mask_name(name: str) -> str:
    '''
    '한지원' -> '한*원' (DB 설계서 v2.2 - (4.5) MEMBER.name 기준)
    '''
    if len(name) <= 1:
        return name
    elif len(name) == 2:
        return f"{name[0]}*"
    else:
        return f"{name[0]}{'*' * (len(name) - 2)}{name[-1]}"
