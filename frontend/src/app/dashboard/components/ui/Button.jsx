import styles from './button.module.css';

const VARIANT_CLASS_NAME = {
  secondary: styles.secondary,
  primary: styles.primary,
};

export default function Button({
  variant = 'secondary',
  leadingIcon,
  children,
  type = 'button',
  ...props
}) {
  const variantClassName = VARIANT_CLASS_NAME[variant] ?? styles.secondary;

  return (
    <button
      {...props}
      type={type}
      className={`${styles.button} ${variantClassName}`}
    >
      {leadingIcon ? <span className={styles.icon}>{leadingIcon}</span> : null}
      {children}
    </button>
  );
}
