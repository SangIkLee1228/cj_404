import styles from '../../pos.module.css';

export default function CaptureControls({ hasCaptured, paid, onRetake, onAdd, onBasic }) {
  return (
    <div className={styles.captureActions}>
      <button type="button" className={styles.captureAction} disabled={!hasCaptured || paid} onClick={onRetake}>
        <span className={styles.camIcon}>↻</span>다시 촬영
      </button>
      <button type="button" className={styles.captureAction} disabled={!hasCaptured || paid} onClick={onAdd}>
        <span className={styles.camIcon}>＋</span>추가 촬영
      </button>
      <button
        type="button"
        className={`${styles.captureAction} ${styles.primary}`}
        disabled={paid}
        onClick={onBasic}
      >
        <span className={styles.camIcon}>▣</span>기본 촬영
      </button>
    </div>
  );
}
