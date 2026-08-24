import styles from '../../pos.module.css';
import ProductCard from './ProductCard';
import {
  BREAD_CATALOG,
  BREAD_CATEGORIES,
  DRINK_CATALOG,
  DRINK_CATEGORIES,
} from '../../mock-data/mockProducts';
import { mergeCatalogWithManagerState } from '../../sync/posSync';

export default function ProductCatalog({
  productType,
  category,
  managerState,
  remainingOf,
  onSetType,
  onSetCategory,
  onAdd,
}) {
  const isDrink = productType === 'drink';
  const baseCatalog = isDrink ? DRINK_CATALOG : BREAD_CATALOG;
  const catalog = mergeCatalogWithManagerState(baseCatalog, managerState);
  const categories = isDrink ? DRINK_CATEGORIES : BREAD_CATEGORIES;
  const items =
    category === '전체'
      ? catalog
      : catalog.filter((p) => p.category === category);

  return (
    <>
      <div className={styles.rightTitle}>
        빵·음료 메뉴를 선택해 현재 계산에 직접 추가할 수 있어요
      </div>
      <div className={styles.catalogShell}>
        <section className={styles.catalogMain}>
          <div className={styles.catalogHead}>
            <div className={styles.catalogTitleWrap}>
              <b>{isDrink ? '음료 상품' : '빵 상품'}</b>
              <span className={styles.catalogHelp}>
                상품 사진을 눌러 계산에 추가
              </span>
            </div>
            <div className={styles.manualTools} aria-label="상품 종류 선택">
              <button
                type="button"
                className={`${styles.manualBtn} ${!isDrink ? styles.active : ''}`}
                onClick={() => onSetType('bread')}
              >
                <span>＋</span>빵
              </button>
              <button
                type="button"
                className={`${styles.manualBtn} ${isDrink ? styles.active : ''}`}
                onClick={() => onSetType('drink')}
              >
                <span>＋</span>음료
              </button>
            </div>
          </div>
          <nav className={styles.catalogRail} aria-label="상품 카테고리">
            <div className={styles.catalogBrand}>
              {isDrink ? 'DRINK' : 'BREAD'}
            </div>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.categoryBtn} ${category === c ? styles.active : ''}`}
                onClick={() => onSetCategory(c)}
              >
                {category === c ? '✓ ' : ''}
                {c}
              </button>
            ))}
          </nav>
          <div className={styles.kioskGrid}>
            {items.map((product) => (
              <ProductCard
                key={product.productId}
                product={product}
                remaining={remainingOf(product.name)}
                isDrink={isDrink}
                onAdd={onAdd}
              />
            ))}
          </div>
        </section>
      </div>
      <div className={styles.rightNote}>
        ※ 직접 추가 상품도 결제 완료 시 판매·재고 반영 흐름에 동일하게
        포함됩니다.
      </div>
    </>
  );
}
