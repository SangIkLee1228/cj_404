// /dashboard 하위 경로에만 적용되며 전역 앱과 POS 레이아웃을
// 변경하지 않는다.
import styles from './dashboard-layout.module.css';
import themeStyles from './styles/dashboard-theme.module.css';
import DashboardSidebar from './components/DashboardSidebar';
import DashboardTopbar from './components/DashboardTopbar';

// themeStyles.theme이 Dashboard 컬러 토큰(--dashboard-*)을 선언한다.
// 이 최상위 요소의 자손에만 상속되므로 POS·전역 화면에는 전파되지 않는다.
export default function DashboardLayout({ children }) {
  return (
    <div className={`${styles.layout} ${themeStyles.theme}`}>
      <DashboardSidebar />
      <main className={styles.main}>
        <DashboardTopbar />
        <div className={styles.contentViewport}>{children}</div>
      </main>
    </div>
  );
}
