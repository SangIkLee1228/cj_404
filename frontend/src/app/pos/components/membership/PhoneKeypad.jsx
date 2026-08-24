import styles from '../../pos.module.css';
import { formatPhoneDisplay } from '../../helpers/formatters';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', 'back'];

export default function PhoneKeypad({ phone, onKey, onCancel, onConfirm }) {
  const confirmDisabled = phone.length !== 11;

  return (
    <div className={styles.phoneModal}>
      <div className={styles.modalTitle}>휴대폰 번호를 입력해주세요</div>
      <div className={styles.phoneHint}>010은 자동 입력되어 있습니다.</div>
      <div className={styles.phoneInput}>{formatPhoneDisplay(phone)}</div>
      <div className={styles.keypad}>
        {KEYS.map((k, i) => {
          if (k === null) return <button key={`blank-${i}`} type="button" className={`${styles.key} ${styles.blank}`} tabIndex={-1} />;
          if (k === 'back')
            return (
              <button key={k} type="button" className={`${styles.key} ${styles.back}`} onClick={() => onKey('back')}>
                ⌫
              </button>
            );
          return (
            <button key={k} type="button" className={styles.key} onClick={() => onKey(k)}>
              {k}
            </button>
          );
        })}
      </div>
      <div className={styles.modalActions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          취소
        </button>
        <button type="button" className={styles.confirm} disabled={confirmDisabled} onClick={onConfirm}>
          확인
        </button>
      </div>
    </div>
  );
}
