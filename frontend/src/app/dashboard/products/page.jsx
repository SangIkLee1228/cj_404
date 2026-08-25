import PageHeader from '../components/PageHeader';
import styles from '../dashboard-layout.module.css';

export default function ProductsPage() {
  return (
    <section className={styles.page}>
      <PageHeader
        title="상품 관리"
        description="상품 정보와 판매 상태를 관리합니다."
      />
      <div className={styles.pageContent}>
        <p>상품 관리 화면을 준비하고 있습니다.</p>
      </div>
    </section>
  );
}
