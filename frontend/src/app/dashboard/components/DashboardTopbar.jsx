'use client';

import { usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import styles from '../dashboard-layout.module.css';
import { DASHBOARD_ROUTES, getDashboardRoute } from '../dashboard-routes';
import Button from './ui/Button';

export default function DashboardTopbar() {
  const pathname = usePathname();
  const currentRoute = getDashboardRoute(pathname);
  const title = currentRoute?.label ?? DASHBOARD_ROUTES.overview.label;

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarHeading}>
        <div className={styles.topbarTitle}>{title}</div>
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
        <Button
          variant="secondary"
          leadingIcon={<RefreshCw aria-hidden="true" />}
          disabled
        >
          데이터 동기화
        </Button>
        <Button variant="primary" disabled>
          직원 POS 열기 ↗
        </Button>
      </div>
    </header>
  );
}
