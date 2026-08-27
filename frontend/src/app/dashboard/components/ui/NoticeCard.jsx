import styles from './notice-card.module.css';

export default function NoticeCard({
  title,
  meta,
  children,
  className,
  ...props
}) {
  const classNames = [styles.noticeCard, className].filter(Boolean).join(' ');

  return (
    <section className={classNames} {...props}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
