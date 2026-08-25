import PageHeader from '../components/PageHeader';
import styles from '../dashboard-layout.module.css';

export default function AlertsPage() {
  return (
    <section className={styles.page}>
      <PageHeader
        title="알림"
        description="재고 및 운영 관련 알림을 확인합니다."
      />
      <div className={styles.pageContent}>
        <p>알림 화면을 준비하고 있습니다.</p>
      </div>
    </section>
  );
}
