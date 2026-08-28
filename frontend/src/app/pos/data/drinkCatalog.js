/**
 * 음료(DRINK) 카탈로그 — 이 파일은 의도적으로 Backend API를 전혀 쓰지 않는다.
 *
 * BREAD는 실제 backend product API로 연동됐지만, 음료는 확정된 설계에 따라
 * 상품 조회·장바구니·주문·결제·재고 전 구간이 Frontend-only로 남는다.
 *
 * 목록 source of truth: 첨부받은 product_rows.csv(product_type=DRINK,
 * is_active=true 28건, category 8종). product_name·category는 그 CSV를
 * 그대로 옮겼다(임의 축약·변경 없음).
 *
 * sourceProductId는 CSV/backend product_id를 "어떤 실제 상품에 대응하는지"
 * 참고하기 위한 reference일 뿐이다 — POST /orders/{id}/items 등 backend
 * 호출에 쓰지 않는다. productId(화면·장바구니 식별자)는 backend BREAD
 * product_id(정수)와 절대 충돌하지 않도록 'drink-local-' 접두어 + 그 참고
 * id로 만든다.
 *
 * price는 임의 생성하지 않았다 — CSV에 price 컬럼이 없어, 같은 product_id로
 * 연결되는 실제 backend/DB 상품 가격을 READ ONLY로 조회해 그대로 옮겼다
 * (28건 전부 resolved, 발명한 가격 없음).
 */

export const DRINK_CATALOG = [
  // 커피 (3)
  {
    sourceProductId: 11,
    name: '그랑드카페 아메리카노 HOT',
    price: 3800,
    category: '커피',
    emoji: '☕',
  },
  {
    sourceProductId: 58,
    name: '아샷추 라지 ICED',
    price: 4500,
    category: '커피',
    emoji: '☕',
  },
  {
    sourceProductId: 60,
    name: '아이스아메리카노',
    price: 3800,
    category: '커피',
    emoji: '☕',
  },
  // 라떼 (5)
  {
    sourceProductId: 23,
    name: '딸기라떼',
    price: 4300,
    category: '라떼',
    emoji: '🥛',
  },
  {
    sourceProductId: 42,
    name: '바닐라라떼 HOT',
    price: 4800,
    category: '라떼',
    emoji: '🥛',
  },
  {
    sourceProductId: 59,
    name: '아이스바닐라라떼',
    price: 4800,
    category: '라떼',
    emoji: '🥛',
  },
  {
    sourceProductId: 62,
    name: '아이스카페라떼',
    price: 4200,
    category: '라떼',
    emoji: '🥛',
  },
  {
    sourceProductId: 89,
    name: '카페라떼 HOT',
    price: 4200,
    category: '라떼',
    emoji: '🥛',
  },
  // 마끼아또 (2)
  {
    sourceProductId: 61,
    name: '아이스카라멜마끼아또',
    price: 4800,
    category: '마끼아또',
    emoji: '☕',
  },
  {
    sourceProductId: 86,
    name: '카라멜마끼아또 HOT',
    price: 4800,
    category: '마끼아또',
    emoji: '☕',
  },
  // 스무디 (2)
  {
    sourceProductId: 22,
    name: '딸기 스무디',
    price: 5300,
    category: '스무디',
    emoji: '🥤',
  },
  {
    sourceProductId: 35,
    name: '망고 스무디',
    price: 5300,
    category: '스무디',
    emoji: '🥤',
  },
  // 쉐이크 (3)
  {
    sourceProductId: 47,
    name: '사르르 딸기 쉐이크',
    price: 5300,
    category: '쉐이크',
    emoji: '🥤',
  },
  {
    sourceProductId: 48,
    name: '사르르 우유 쉐이크',
    price: 5100,
    category: '쉐이크',
    emoji: '🥤',
  },
  {
    sourceProductId: 49,
    name: '사르르커피쉐이크',
    price: 5500,
    category: '쉐이크',
    emoji: '🥤',
  },
  // 음료 (6) — 아이스티류(납작복숭아/복숭아/유자그린티) → 에이드류(레몬/자몽) → 차(한라봉차)
  {
    sourceProductId: 17,
    name: '납작복숭아아이스티 제로',
    price: 3900,
    category: '음료',
    emoji: '🥤',
  },
  {
    sourceProductId: 45,
    name: '복숭아아이스티 레귤러',
    price: 3800,
    category: '음료',
    emoji: '🥤',
  },
  {
    sourceProductId: 72,
    name: '유자그린티아이스티 제로',
    price: 3900,
    category: '음료',
    emoji: '🥤',
  },
  {
    sourceProductId: 32,
    name: '레몬에이드 레귤러',
    price: 4500,
    category: '음료',
    emoji: '🥤',
  },
  {
    sourceProductId: 73,
    name: '자몽에이드 레귤러',
    price: 4500,
    category: '음료',
    emoji: '🥤',
  },
  {
    sourceProductId: 75,
    name: '제주 한라봉차',
    price: 4800,
    category: '음료',
    emoji: '🥤',
  },
  // 우유·주스 (5) — 우유류(곰돌이푸/뚜레쥬르 우유/초코우유) → 주스류(사과/오렌지)
  {
    sourceProductId: 9,
    name: '곰돌이푸 신선한우유 200ml',
    price: 1700,
    category: '우유·주스',
    emoji: '🧃',
  },
  {
    sourceProductId: 25,
    name: '뚜레쥬르 우유 900ml',
    price: 3900,
    category: '우유·주스',
    emoji: '🧃',
  },
  {
    sourceProductId: 96,
    name: '티거의 진한 초코우유 200ml',
    price: 1600,
    category: '우유·주스',
    emoji: '🧃',
  },
  {
    sourceProductId: 28,
    name: '뚜레쥬르가 만든 사과주스',
    price: 2700,
    category: '우유·주스',
    emoji: '🧃',
  },
  {
    sourceProductId: 29,
    name: '뚜레쥬르오렌지주스 180ml',
    price: 2700,
    category: '우유·주스',
    emoji: '🧃',
  },
  // 기타 (2)
  {
    sourceProductId: 12,
    name: '그랑드카페 콜드브루 보틀 원액',
    price: 15000,
    category: '기타',
    emoji: '🧊',
  },
  {
    sourceProductId: 104,
    name: '피지워터 500ml',
    price: 2800,
    category: '기타',
    emoji: '💧',
  },
].map((p) => ({
  ...p,
  productId: `drink-local-${p.sourceProductId}`,
  productType: 'DRINK',
  imageUrl: null,
}));

export function isLocalDrinkId(productId) {
  return typeof productId === 'string' && productId.startsWith('drink-local-');
}

export function findDrinkById(productId) {
  return DRINK_CATALOG.find((d) => d.productId === productId) || null;
}
