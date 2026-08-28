import styles from '../../pos.module.css';

export default function CaptureControls({
  hasCaptured,
  paid,
  cartEmpty,
  onRetake,
  onAdd,
  onBasic,
  onCancelOrder,
}) {
  return (
    <div className={styles.captureActions}>
      {/* 계산 취소: 파괴적 조작이라 주 조작(기본 촬영)에서 물리적으로 가장 먼
          줄 왼쪽 끝에 별도로 둔다 (rules/design/pos.md). */}
      <button
        type="button"
        className={styles.cancelOrderBtn}
        disabled={cartEmpty || paid}
        onClick={onCancelOrder}
      >
        계산 취소
      </button>
      <div className={styles.captureActionGroup}>
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
    </div>
  );
}
