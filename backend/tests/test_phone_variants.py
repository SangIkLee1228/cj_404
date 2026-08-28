"""휴대폰번호 조회 형식 (app/core/formatting.py).

명세서 4.6은 `01012345678`을 쓰는데 MEMBER.phone에는 `010-5506-5012`가 들어 있다.
한쪽만 조회하면 정상 회원이 항상 404가 나므로 양쪽을 모두 시도한다.
"""

from app.core.formatting import phone_variants


def test_plain_number_also_yields_hyphenated_form():
    assert phone_variants("01055065012") == ["01055065012", "010-5506-5012"]


def test_hyphenated_input_is_normalized_first():
    """FE가 어느 쪽으로 보내든 같은 후보 목록이 나와야 한다."""
    assert phone_variants("010-5506-5012") == phone_variants("01055065012")


def test_ten_digit_mobile_keeps_its_own_hyphen_shape():
    """011/016 같은 구 번호대는 3-3-4로 끊긴다. 11자리 규칙으로 쪼개면 못 찾는다."""
    assert phone_variants("0112345678") == ["0112345678", "011-234-5678"]


def test_other_lengths_get_no_hyphen_guess():
    """9자리·12자리 등은 어디서 끊을지 알 수 없으므로 숫자 그대로만 시도한다."""
    assert phone_variants("123456789") == ["123456789"]


def test_empty_input_is_empty_list():
    """빈 리스트를 .in_()에 넘기면 아무것도 안 맞는다 = 404. 예외보다 낫다."""
    assert phone_variants("") == []
    assert phone_variants("---") == []
