import styles from '../../pos.module.css';
import { formatWon } from '../../helpers/formatters';

const DASHBOARD_PATH = '/dashboard';

export default function TopBar({ totalAmount }) {
  // 대시보드 상단바의 '직원 POS 열기'와 대칭 동작이다. 같은 탭에서 이동하지
  // 않고 새 창으로 여는 이유는 대칭성보다 POS 상태 쪽이 크다 — POS는 진행
  // 중인 주문(장바구니·촬영 결과)을 들고 있어서, 같은 탭을 대시보드로
  // 넘기면 결제 전 주문이 화면에서 사라진다.
  // noopener,noreferrer로 열어 새 창이 window.opener로 POS를 조작하지 못하게 한다.
  const openDashboard = () => {
    window.open(DASHBOARD_PATH, '_blank', 'noopener,noreferrer');
  };

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
      <button
        type="button"
        className={styles.dashboardBtn}
        onClick={openDashboard}
      >
        대시보드 열기 ↗
      </button>
    </header>
  );
}
