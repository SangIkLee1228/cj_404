import { useState } from 'react';
import styles from '../../pos.module.css';
import { formatWon } from '../../helpers/formatters';
import { getBreadImageUrl } from '../../supabase/productImages';

export default function ProductCard({ product, remaining, isDrink, onAdd }) {
  const soldout = remaining !== Infinity && remaining <= 0;
  const [imageFailed, setImageFailed] = useState(false);
  // 음료는 이번 작업 대상이 아니므로 기존 emoji 표시를 그대로 유지한다.
  const imageUrl = isDrink ? null : getBreadImageUrl(product);
  const showImage = imageUrl && !imageFailed;

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
        {showImage ? (
          <img
            className={styles.kioskImage}
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className={styles.kioskEmoji}>{product.emoji}</span>
        )}
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
