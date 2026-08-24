import styles from '../../pos.module.css';
import { formatWon } from '../../helpers/formatters';

export default function ProductCard({ product, remaining, isDrink, onAdd }) {
  const soldout = remaining !== Infinity && remaining <= 0;

  return (
    <div
      className={`${styles.kioskCard} ${soldout ? styles.soldout : ''}`}
      onClick={soldout ? undefined : () => onAdd(product.name)}
      role="button"
      tabIndex={soldout ? -1 : 0}
      aria-disabled={soldout}
      onKeyDown={(e) => {
        if (!soldout && (e.key === 'Enter' || e.key === ' '))
          onAdd(product.name);
      }}
    >
      <div className={`${styles.kioskPhoto} ${isDrink ? styles.drink : ''}`}>
        <span className={styles.kioskEmoji}>{product.emoji}</span>
      </div>
      <div className={styles.kioskInfo}>
        <div className={styles.kioskName}>{product.name}</div>
        <div className={styles.kioskPrice}>{formatWon(product.price)}</div>
        {soldout && (
          <div className={styles.kioskStockNote}>현재 매진 · 추가 불가</div>
        )}
      </div>
    </div>
  );
}
