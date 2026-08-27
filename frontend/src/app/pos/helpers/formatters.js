export function formatWon(amount) {
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
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
