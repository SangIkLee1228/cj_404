import styles from '../../pos.module.css';
import { formatWon } from '../../helpers/formatters';

export default function TopBar({ totalAmount }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span
          className={styles.brandLogo}
          role="img"
          aria-label="TOUS les JOURS"
        />
        스냅빵
      </div>
      <div className={styles.role}>뚜레쥬르 POS</div>
      <div className={styles.topTotal}>
        합계 <b>{formatWon(totalAmount)}</b>
      </div>
    </header>
  );
}
