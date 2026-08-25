// /dashboard 하위 경로에만 적용되며 전역 앱과 POS 레이아웃을
// 변경하지 않는다.
import styles from './dashboard-layout.module.css';
import DashboardSidebar from './components/DashboardSidebar';
import DashboardTopbar from './components/DashboardTopbar';

export default function DashboardLayout({ children }) {
  return (
    <div className={styles.layout}>
      <DashboardSidebar />
      <main className={styles.main}>
        <DashboardTopbar />
        <div className={styles.contentViewport}>{children}</div>
      </main>
    </div>
  );
}
