import styles from '../../pos.module.css';

export default function CaptureControls({
  hasCaptured,
  paid,
  onRetake,
  onAdd,
  onBasic,
}) {
  return (
    <div className={styles.captureActions}>
      <button
        type="button"
        className={styles.captureAction}
        disabled={!hasCaptured || paid}
        onClick={onRetake}
      >
        <span className={styles.camIcon}>↻</span>다시 촬영
      </button>
      <button
        type="button"
        className={styles.captureAction}
        disabled={!hasCaptured || paid}
        onClick={onAdd}
      >
        <span className={styles.camIcon}>＋</span>추가 촬영
      </button>
      {/* 촬영 후에는 잠근다. 다시 찍는 건 "다시 촬영"의 역할이고, 그쪽은 직전 세션을
          discard한 뒤 새로 찍는다. 여기를 열어두면 같은 트레이를 두 번 합산하게 된다. */}
      <button
        type="button"
        className={`${styles.captureAction} ${styles.primary}`}
        disabled={hasCaptured || paid}
        onClick={onBasic}
      >
        <span className={styles.camIcon}>▣</span>기본 촬영
      </button>
    </div>
  );
}
