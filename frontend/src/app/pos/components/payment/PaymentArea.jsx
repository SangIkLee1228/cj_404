import styles from '../../pos.module.css';
import { formatWon } from '../../helpers/formatters';

export default function PaymentArea({
  totalCount,
  totalAmount,
  paid,
  cartEmpty,
  memberConfirmed,
  onOpenMembership,
  onPay,
  onNewOrder,
}) {
  return (
    <div className={styles.payRow}>
      <button
        type="button"
        className={`${styles.payMembershipBtn} ${memberConfirmed ? styles.active : ''}`}
        disabled={cartEmpty || paid || memberConfirmed}
        onClick={onOpenMembership}
      >
        {memberConfirmed ? '적립 예정' : '적립'}
      </button>
      <button
        type="button"
        className={styles.payBtn}
        disabled={!paid && cartEmpty}
        onClick={paid ? onNewOrder : onPay}
      >
        {paid ? (
          <span className={styles.payBtnLabel}>새 손님 받기</span>
        ) : (
          <>
            <span className={styles.payCountChip}>{totalCount}</span>
            <span className={styles.payBtnLabel}>
              {formatWon(totalAmount)} 결제
            </span>
          </>
        )}
      </button>
    </div>
  );
}
