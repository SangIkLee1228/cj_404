import PageHeader from '../components/PageHeader';
import styles from '../dashboard-layout.module.css';

export default function SalesPage() {
  return (
    <section className={styles.page}>
      <PageHeader
        title="판매 통계"
        description="기간별 판매 현황과 추이를 확인합니다."
      />
      <div className={styles.pageContent}>
        <p>판매 통계 화면을 준비하고 있습니다.</p>
      </div>
    </section>
  );
}
