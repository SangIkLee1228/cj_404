import styles from '../../pos.module.css';
import { maskMemberName } from '../../helpers/formatters';

export default function MembershipPanel({
  cartEmpty,
  paid,
  memberConfirmed,
  memberName,
  points,
  onOpenMembership,
  onCancelOrder,
}) {
  return (
    <>
      <div
        className={`${styles.statusStrip} ${memberConfirmed ? styles.show : ''}`}
      >
        <span>
          회원 확인 · {maskMemberName(memberName)} · 적립 예정 {points}P
        </span>
        <span>×</span>
      </div>
      <div className={styles.payTools}>
        <button
          type="button"
          className={styles.toolBtn}
          disabled={cartEmpty || paid || memberConfirmed}
          onClick={onOpenMembership}
        >
          {memberConfirmed ? 'CJ ONE 적립 예정' : 'CJ ONE 멤버십 적립 (0.5%)'}
        </button>
        <button
          type="button"
          className={`${styles.toolBtn} ${styles.cancelOrder}`}
          disabled={cartEmpty || paid}
          onClick={onCancelOrder}
        >
          계산 취소
        </button>
      </div>
    </>
  );
}
