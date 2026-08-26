import Card from './Card';
import styles from './table-card.module.css';

export default function TableCard({
  title,
  headerMeta,
  children,
  className,
  ...props
}) {
  const classNames = [styles.tableCard, className].filter(Boolean).join(' ');
  const hasHeader = Boolean(title) || Boolean(headerMeta);

  return (
    <Card padding="none" className={classNames} {...props}>
      {hasHeader ? (
        <div className={styles.header}>
          {title ? <h2 className={styles.title}>{title}</h2> : null}
          {headerMeta ? (
            <span className={styles.headerMeta}>{headerMeta}</span>
          ) : null}
        </div>
      ) : null}
      <div className={styles.body}>{children}</div>
    </Card>
  );
}
