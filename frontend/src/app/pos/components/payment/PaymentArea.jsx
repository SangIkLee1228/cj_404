import styles from '../../pos.module.css';
import { formatWon } from '../../helpers/formatters';

export default function PaymentArea({ totalCount, totalAmount, paid, cartEmpty, onPay, onNewOrder }) {
  return (
    <>
      <div className={styles.summaryLine}>
        <span>총 {totalCount}개</span>
        <strong>{formatWon(totalAmount)}</strong>
      </div>
      <button
        type="button"
        className={styles.payBtn}
        disabled={!paid && cartEmpty}
        onClick={paid ? onNewOrder : onPay}
      >
        {paid ? '새 손님 받기' : '결제하기'}
      </button>
    </>
  );
}
