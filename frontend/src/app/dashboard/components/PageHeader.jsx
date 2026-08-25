import styles from '../dashboard-layout.module.css';

export default function PageHeader({ title, description, actions }) {
  return (
    <header className={styles.pageHeader}>
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
