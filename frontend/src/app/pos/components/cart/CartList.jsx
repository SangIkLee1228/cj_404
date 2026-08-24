import styles from '../../pos.module.css';
import { formatWon } from '../../helpers/formatters';

const SOURCE_LABEL = {
  manual: '직원 추가',
  ai: 'AI 인식',
  mixed: 'AI + 직원',
};

export default function CartList({ items, remainingOf, onChangeQty }) {
  if (items.length === 0) {
    return (
      <div className={styles.scanList}>
        <div className={styles.scanEmpty}>
          <b>계산 상품이 아직 없습니다</b>
          <span>트레이 촬영 또는 오른쪽 상품 메뉴에서 빵·음료를 추가해주세요.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.scanList}>
      {items.map((item) => {
        const remaining = remainingOf(item.name);
        const plusDisabled = remaining !== Infinity && item.qty >= remaining;
        return (
          <div className={styles.scanRow} key={item.name}>
            <div className={styles.scanIcon}>▣</div>
            <div>
              <div className={styles.scanName}>
                {item.name}
                <span className={styles.sourceBadge}>{SOURCE_LABEL[item.source]}</span>
              </div>
              <div className={styles.scanSub}>
                {formatWon(item.price)}
                {remaining !== Infinity ? ` · 재고 ${remaining}개` : ''}
              </div>
            </div>
            <button
              type="button"
              className={styles.qtyBtn}
              onClick={() => onChangeQty(item.name, -1)}
              aria-label={`${item.name} 수량 감소`}
            >
              −
            </button>
            <div className={styles.qty}>{item.qty}</div>
            <button
              type="button"
              className={styles.qtyBtn}
              disabled={plusDisabled}
              onClick={() => onChangeQty(item.name, 1)}
              aria-label={`${item.name} 수량 증가`}
            >
              ＋
            </button>
            <div className={styles.scanPrice}>{formatWon(item.price * item.qty)}</div>
          </div>
        );
      })}
    </div>
  );
}
