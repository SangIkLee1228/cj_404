import PageHeader from '../components/PageHeader';
import styles from '../dashboard-layout.module.css';

export default function InventoryPage() {
  return (
    <section className={styles.page}>
      <PageHeader
        title="재고 관리"
        description="상품별 재고와 상태를 확인합니다."
      />
      <div className={styles.pageContent}>
        <p>재고 관리 화면을 준비하고 있습니다.</p>
      </div>
    </section>
  );
}
