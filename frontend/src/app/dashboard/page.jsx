import OverviewPageContent from './OverviewPageContent';

// MVP는 로그인 화면을 구현하지 않는다 (DB 설계서 v1.4 · 7장 / API 명세서 v1.2 · 1.1).
// 직원·매장은 백엔드가 AUTH_DISABLED=true 기준으로 고정값(store_id=1, staff_id=1)을 결정한다.
export default function DashboardPage() {
  return <OverviewPageContent />;
}
