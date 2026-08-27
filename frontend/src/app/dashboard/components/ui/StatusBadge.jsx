import styles from './status-badge.module.css';

export default function StatusBadge({ status, children, className, ...props }) {
  const classNames = [styles.badge, className].filter(Boolean).join(' ');

  return (
    <span {...props} className={classNames} data-status={status}>
      {children}
    </span>
  );
}
