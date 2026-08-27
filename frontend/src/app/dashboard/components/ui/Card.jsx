import styles from './card.module.css';

export default function Card({
  children,
  className,
  padding = 'default',
  ...props
}) {
  const paddingClassName =
    padding === 'none' ? styles.paddingNone : styles.paddingDefault;

  const classNames = [styles.card, paddingClassName, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} {...props}>
      {children}
    </div>
  );
}
