import styles from '../../pos.module.css';
import ProductCard from './ProductCard';
import { getBreadDisplayIndex } from '../../data/breadDisplayOrder';

/** 실제 카탈로그 응답 순서(product_type, category, product_name)를 그대로 쓰고,
 * 카테고리 칩은 그 목록에 실제로 등장하는 카테고리만 등장 순서대로 뽑아 만든다.
 * "기타" 탭은 POS 화면에서 노출하지 않는다 — category가 없는 상품(예: null)이
 * 있어도 탭에는 올리지 않는다. 해당 상품 자체는 "전체" 탭에서는 그대로 보인다,
 * 탭으로 골라 볼 수만 없을 뿐이다. */
function buildCategories(items) {
  const seen = new Set();
  const list = ['전체'];
  items.forEach((p) => {
    if (p.category && p.category !== '기타' && !seen.has(p.category)) {
      seen.add(p.category);
      list.push(p.category);
    }
  });
  return list;
}

/** BREAD는 breadDisplayOrder.js의 진열 순서(product_id 기준)로 정렬한다 —
 * DRINK는 drinkCatalog.js에 이미 카테고리/family 순서대로 선언돼 있으므로
 * 그 선언 순서를 그대로 진열 순서로 쓴다. 원본 배열은 건드리지 않고 복사본만
 * 정렬해서 반환한다(디스플레이 파생 배열). */
function sortForDisplay(items, isDrink) {
  if (isDrink) return items;
  return [...items].sort((a, b) => {
    const diff =
      getBreadDisplayIndex(a.productId) - getBreadDisplayIndex(b.productId);
    return diff !== 0 ? diff : a.productId - b.productId;
  });
}

export default function ProductCatalog({
  productType,
  category,
  products,
  remainingOf,
  onSetType,
  onSetCategory,
  onAdd,
}) {
  const isDrink = productType === 'drink';
  const catalog = sortForDisplay(
    products.filter((p) => p.productType === (isDrink ? 'DRINK' : 'BREAD')),
    isDrink
  );
  const categories = buildCategories(catalog);
  const items =
    category === '전체'
      ? catalog
      : catalog.filter((p) => p.category === category);

  return (
    <>
      <div className={`${styles.rightTitle} text-[12px] leading-snug`}>
        빵·음료 메뉴를 선택해 현재 계산에 직접 추가할 수 있어요
      </div>
      <div className={styles.catalogShell}>
        <section className={styles.catalogMain}>
          <div className={styles.catalogHead}>
            <div className={styles.catalogTitleWrap}>
              <b className="text-[15px] font-extrabold tracking-tight">
                {isDrink ? '음료 상품' : '빵 상품'}
              </b>
              <span
                className={`${styles.catalogHelp} text-[11px] leading-snug`}
              >
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
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.categoryBtn} text-[11px] font-semibold tracking-tight max-[1380px]:text-[9px] ${category === c ? styles.active : ''}`}
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
                remaining={remainingOf(product.productId)}
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
