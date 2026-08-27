/**
 * 음료(DRINK) 카탈로그 — 이 파일은 의도적으로 Backend API를 전혀 쓰지 않는다.
 *
 * BREAD는 실제 backend product API로 연동됐지만, 음료는 확정된 설계에 따라
 * 상품 조회·장바구니·주문·결제·재고 전 구간이 Frontend-only로 남는다.
 * productId는 backend product_id(정수)와 절대 충돌하지 않도록 'drink-local-' 접두어를 쓴다.
 */

export const DRINK_CATALOG = [
  {
    productId: 'drink-local-001',
    name: '아이스 아메리카노',
    price: 3500,
    category: '커피',
    emoji: '☕',
  },
  {
    productId: 'drink-local-002',
    name: '카페라떼',
    price: 4000,
    category: '커피',
    emoji: '☕',
  },
  {
    productId: 'drink-local-003',
    name: '바닐라 라떼',
    price: 4500,
    category: '커피',
    emoji: '☕',
  },
  {
    productId: 'drink-local-004',
    name: '카푸치노',
    price: 4200,
    category: '커피',
    emoji: '☕',
  },
  {
    productId: 'drink-local-005',
    name: '콜드브루',
    price: 4300,
    category: '커피',
    emoji: '🥤',
  },
  {
    productId: 'drink-local-006',
    name: '유자차',
    price: 3800,
    category: '티',
    emoji: '🍵',
  },
  {
    productId: 'drink-local-007',
    name: '얼그레이티',
    price: 3500,
    category: '티',
    emoji: '🍵',
  },
  {
    productId: 'drink-local-008',
    name: '복숭아 아이스티',
    price: 3500,
    category: '티',
    emoji: '🥤',
  },
  {
    productId: 'drink-local-009',
    name: '자몽에이드',
    price: 4500,
    category: '에이드/주스',
    emoji: '🥤',
  },
  {
    productId: 'drink-local-010',
    name: '레몬에이드',
    price: 4300,
    category: '에이드/주스',
    emoji: '🥤',
  },
  {
    productId: 'drink-local-011',
    name: '청포도에이드',
    price: 4500,
    category: '에이드/주스',
    emoji: '🥤',
  },
  {
    productId: 'drink-local-012',
    name: '오렌지 주스',
    price: 4000,
    category: '에이드/주스',
    emoji: '🧃',
  },
  {
    productId: 'drink-local-013',
    name: '딸기우유',
    price: 3000,
    category: '우유/기타',
    emoji: '🥛',
  },
  {
    productId: 'drink-local-014',
    name: '흰우유',
    price: 2000,
    category: '우유/기타',
    emoji: '🥛',
  },
  {
    productId: 'drink-local-015',
    name: '생수',
    price: 1500,
    category: '우유/기타',
    emoji: '💧',
  },
].map((p) => ({ ...p, productType: 'DRINK', imageUrl: null }));

export function isLocalDrinkId(productId) {
  return typeof productId === 'string' && productId.startsWith('drink-local-');
}

export function findDrinkById(productId) {
  return DRINK_CATALOG.find((d) => d.productId === productId) || null;
}
