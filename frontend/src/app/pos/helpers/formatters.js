export function formatWon(amount) {
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
}

/** 회원명 마스킹: 정우현 → 정O현, 두 글자면 정O */
export function maskMemberName(name) {
  const v = String(name || '').trim();
  if (v.length <= 1) return v;
  if (v.length === 2) return `${v[0]}O`;
  return `${v[0]}O${v[v.length - 1]}`;
}

/** 0.5% 고정 적립 포인트 (등급 차등 없음) */
export function computePoints(totalAmount) {
  return Math.floor(totalAmount * 0.005);
}

/** '01012345678' → '010-1234-5678', 미입력분은 '_'로 채운다 */
export function formatPhoneDisplay(digits) {
  const clean = (digits || '').replace(/\D/g, '').slice(0, 11);
  const fixed = clean.startsWith('010')
    ? clean
    : `010${clean.replace(/^010/, '')}`;
  const middle = fixed.slice(3, 7).padEnd(4, '_');
  const last = fixed.slice(7, 11).padEnd(4, '_');
  return `010-${middle}-${last}`;
}
