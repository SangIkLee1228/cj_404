import styles from '../../pos.module.css';

/**
 * 파괴적 조작(계산 취소, 다시 촬영) 확인 Modal.
 * design/foundation.md · design/pos.md 규칙: 결과를 구체적으로 명시하고,
 * 확인 버튼에 "예/아니오" 대신 실행 결과를 그대로 라벨로 쓴다.
 */
export default function ConfirmModal({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(42, 35, 28, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 90,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.phoneModal} style={{ maxWidth: 360 }}>
        <div className={styles.modalTitle}>{title}</div>
        <div className={styles.phoneHint} style={{ margin: '0 0 16px' }}>
          {description}
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            돌아가기
          </button>
          <button type="button" className={styles.confirm} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
