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
  cancelLabel = '돌아가기',
  onConfirm,
  onCancel,
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 90,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.confirmModal}>
        <div className={styles.confirmModalTitle}>{title}</div>
        <div className={styles.confirmModalDesc}>{description}</div>
        <div className={styles.confirmModalActions}>
          <button
            type="button"
            className={styles.confirmModalCancel}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={styles.confirmModalConfirm}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
