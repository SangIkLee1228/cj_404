import { RefreshCw } from 'lucide-react';
import styles from '../dashboard-layout.module.css';

// 현재 메뉴 제목은 아직 라우팅과 연결돼 있지 않아 고정 문구다.
// 라우팅이 연결되면 활성 메뉴 라벨을 그대로 가져와 표시한다.
export default function DashboardTopbar() {
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarHeading}>
        <div className={styles.topbarTitle}>운영 현황</div>
        {/* 실시간 시계는 이후 단계에서 별도 Client Component로 분리해 연결한다.
            hydration 불일치를 피하기 위해 지금은 new Date를 직접 렌더링하지 않는다. */}
        <div className={styles.topbarSubtitle}>실시간 시각 연동 예정</div>
      </div>
      <div className={styles.topbarActions}>
        <div className={styles.topbarStatus}>
          <span className={styles.topbarStatusDot} aria-hidden="true" />
          POS 연결 대기
        </div>
        {/* 아직 실제 동작이 없는 시각적 placeholder다. API 연동 전까지
            disabled로 둬 클릭 가능한 것처럼 보이지 않게 한다. */}
        <button type="button" className={styles.topbarButton} disabled>
          <RefreshCw className={styles.topbarButtonIcon} aria-hidden="true" />
          데이터 동기화
        </button>
        <button type="button" className={styles.topbarButton} disabled>
          직원 POS 열기 ↗
        </button>
      </div>
    </header>
  );
}
