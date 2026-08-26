import styles from '../dashboard-layout.module.css';

// className은 페이지가 이 header 엘리먼트의 배치(flex-wrap/align-items 등)만
// 선택적으로 재정의할 수 있도록 여는 탈출구다. 색상·타이포 같은 PageHeader
// 자체의 스타일은 여전히 dashboard-layout.module.css가 전담하고, 여기서는
// 클래스를 안전하게 병합만 한다 — Card.jsx의 className 병합 방식과 동일하다.
export default function PageHeader({ title, description, actions, className }) {
  const headerClassName = [styles.pageHeader, className]
    .filter(Boolean)
    .join(' ');

  return (
    <header className={headerClassName}>
      <div className={styles.pageHeaderMain}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description ? (
          <p className={styles.pageDescription}>{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className={styles.pageHeaderActions}>{actions}</div>
      ) : null}
    </header>
  );
}
