import styles from '../../pos.module.css';

export default function Toast({ message }) {
  return (
    <div className={`${styles.toast} ${message ? styles.show : ''}`}>
      {message || ''}
    </div>
  );
}
