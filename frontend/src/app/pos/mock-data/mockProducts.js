/**
 * 스냅빵 직원 POS — 상품 카탈로그 / AI 인식 Mock 데이터
 * 스냅빵_직원pos.html 목업의 breadCatalog / drinkCatalog / basicCapture 등을 그대로 이식했다.
 * 실제 AI API·재고 API 연동 전까지 사용하는 Mock이며, 서버 URL은 만들지 않는다.
 */

const rawBreadCatalog = [
  { name: '우유 식빵', price: 4500, category: '식빵', emoji: '🍞' },
  { name: '통밀 식빵', price: 4700, category: '식빵', emoji: '🍞' },
  { name: '생크림 식빵', price: 5200, category: '식빵', emoji: '🍞' },
  { name: '밤 식빵', price: 4900, category: '식빵', emoji: '🍞' },
  { name: '고르곤졸라 곡물빵', price: 3800, category: '건강빵', emoji: '🥖' },
  { name: '통밀 롤', price: 2300, category: '건강빵', emoji: '🥖' },
  { name: '호두 깜빠뉴', price: 4200, category: '건강빵', emoji: '🥖' },
  { name: '올리브 치아바타', price: 3600, category: '건강빵', emoji: '🥖' },
  { name: '소금빵', price: 2200, category: '간식빵', emoji: '🥐' },
  { name: '카망베르 치즈빵', price: 3200, category: '간식빵', emoji: '🥐' },
  { name: '마늘 바게트', price: 3300, category: '간식빵', emoji: '🥖' },
  { name: '단팥빵', price: 2100, category: '간식빵', emoji: '🥯' },
  { name: '소보로빵', price: 2500, category: '간식빵', emoji: '🥯' },
  { name: '크림치즈 베이글', price: 3600, category: '간식빵', emoji: '🥯' },
  { name: '모카번', price: 3000, category: '간식빵', emoji: '🥯' },
  {
    name: '초코 크루아상',
    price: 3500,
    category: '파이/페이스트리',
    subCategory: '페이스트리',
    emoji: '🥐',
  },
  {
    name: '버터 크루아상',
    price: 3200,
    category: '파이/페이스트리',
    subCategory: '페이스트리',
    emoji: '🥐',
  },
  {
    name: '딸기 데니쉬',
    price: 3900,
    category: '파이/페이스트리',
    subCategory: '페이스트리',
    emoji: '🥧',
  },
  {
    name: '애플파이',
    price: 3600,
    category: '파이/페이스트리',
    subCategory: '파이',
    emoji: '🥧',
  },
  {
    name: '초코 스콘',
    price: 2800,
    category: '파이/페이스트리',
    subCategory: '페이스트리',
    emoji: '🧁',
  },
  {
    name: '에그타르트',
    price: 2800,
    category: '파이/페이스트리',
    subCategory: '파이',
    emoji: '🥧',
  },
  {
    name: '팥 도넛',
    price: 2500,
    category: '도넛/고로케',
    subCategory: '도넛',
    emoji: '🍩',
  },
  {
    name: '꽈배기 도넛',
    price: 2200,
    category: '도넛/고로케',
    subCategory: '도넛',
    emoji: '🍩',
  },
  {
    name: '야채 고로케',
    price: 3000,
    category: '도넛/고로케',
    subCategory: '고로케',
    emoji: '🥟',
  },
  {
    name: '카레 고로케',
    price: 3100,
    category: '도넛/고로케',
    subCategory: '고로케',
    emoji: '🥟',
  },
  {
    name: '찹쌀 도넛',
    price: 2300,
    category: '도넛/고로케',
    subCategory: '도넛',
    emoji: '🍩',
  },
  // AI 학습 대상 6종(AI_TRAINED_PRODUCT_NAMES 참고) 중 빵 카테고리 소속 상품.
  // 기존 상품 뒤에 추가만 하여 앞선 항목들의 productId(B001~B026)를 바꾸지 않는다.
  {
    name: '딸기 마카롱 도넛',
    price: 2700,
    category: '도넛/고로케',
    subCategory: '도넛',
    emoji: '🍩',
  },
  {
    name: '옛날 꽈배기 도넛',
    price: 2100,
    category: '도넛/고로케',
    subCategory: '도넛',
    emoji: '🍩',
  },
  {
    name: '김치 고로케',
    price: 3200,
    category: '도넛/고로케',
    subCategory: '고로케',
    emoji: '🥟',
  },
  { name: '리얼초코 소라빵', price: 3200, category: '간식빵', emoji: '🥯' },
  {
    name: '기분좋은 올리브 베이글',
    price: 3600,
    category: '간식빵',
    emoji: '🥯',
  },
];

const rawDrinkCatalog = [
  { name: '아이스 아메리카노', price: 3500, category: '커피', emoji: '☕' },
  { name: '카페라떼', price: 4000, category: '커피', emoji: '☕' },
  { name: '바닐라 라떼', price: 4500, category: '커피', emoji: '☕' },
  { name: '카푸치노', price: 4200, category: '커피', emoji: '☕' },
  { name: '콜드브루', price: 4300, category: '커피', emoji: '🥤' },
  { name: '유자차', price: 3800, category: '티', emoji: '🍵' },
  { name: '얼그레이티', price: 3500, category: '티', emoji: '🍵' },
  { name: '복숭아 아이스티', price: 3500, category: '티', emoji: '🥤' },
  {
    name: '오렌지 주스',
    price: 4000,
    category: '에이드/주스',
    subCategory: '주스',
    emoji: '🧃',
  },
  {
    name: '자몽에이드',
    price: 4500,
    category: '에이드/주스',
    subCategory: '에이드',
    emoji: '🥤',
  },
  {
    name: '레몬에이드',
    price: 4300,
    category: '에이드/주스',
    subCategory: '에이드',
    emoji: '🥤',
  },
  {
    name: '청포도에이드',
    price: 4500,
    category: '에이드/주스',
    subCategory: '에이드',
    emoji: '🥤',
  },
  {
    name: '딸기우유',
    price: 3000,
    category: '우유/기타',
    subCategory: '우유',
    emoji: '🥛',
  },
  {
    name: '흰우유',
    price: 2000,
    category: '우유/기타',
    subCategory: '우유',
    emoji: '🥛',
  },
  {
    name: '생수',
    price: 1500,
    category: '우유/기타',
    subCategory: '기타',
    emoji: '💧',
  },
];

function withIds(items, prefix, productType) {
  return items.map((item, i) => ({
    ...item,
    productId: `${prefix}${String(i + 1).padStart(3, '0')}`,
    productType,
  }));
}

export const BREAD_CATALOG = withIds(rawBreadCatalog, 'B', 'BREAD');
export const DRINK_CATALOG = withIds(rawDrinkCatalog, 'D', 'DRINK');
export const ALL_PRODUCTS = [...BREAD_CATALOG, ...DRINK_CATALOG];

export const BREAD_CATEGORIES = [
  '전체',
  '식빵',
  '건강빵',
  '간식빵',
  '파이/페이스트리',
  '도넛/고로케',
];
export const DRINK_CATEGORIES = [
  '전체',
  '커피',
  '티',
  '에이드/주스',
  '우유/기타',
];

export function findProductByName(name) {
  return ALL_PRODUCTS.find((p) => p.name === name) || null;
}

/**
 * 복합 카테고리("A/B" 형태) 내부에서 상품군끼리 섞이지 않도록 하는 표시 순서.
 * 필터 UI(BREAD_CATEGORIES/DRINK_CATEGORIES)는 그대로 "도넛/고로케" 등
 * 하나의 필터로 유지하고, 그 안에서 카드가 그려지는 순서만 이 표에 따라 정한다.
 */
export const SUBCATEGORY_ORDER = {
  '파이/페이스트리': ['파이', '페이스트리'],
  '도넛/고로케': ['도넛', '고로케'],
  '에이드/주스': ['에이드', '주스'],
  '우유/기타': ['우유', '기타'],
};

function subCategoryRank(product) {
  const order = SUBCATEGORY_ORDER[product.category];
  if (!order || !product.subCategory) return 0;
  const idx = order.indexOf(product.subCategory);
  return idx === -1 ? order.length : idx;
}

/**
 * 카테고리(categoryOrder) → 카테고리 내부 subCategory(SUBCATEGORY_ORDER) 순으로
 * 정렬한다. 같은 subCategory 안에서는 원본 배열 순서를 그대로 유지한다
 * (Array.prototype.sort는 안정 정렬이므로 동률 항목의 상대 순서가 보존된다).
 * subCategory가 없는 상품/카테고리는 영향 없이 원래 자리를 유지한다.
 */
export function sortForDisplay(products, categoryOrder) {
  const categoryRank = new Map(categoryOrder.map((c, i) => [c, i]));
  return [...products].sort((a, b) => {
    const ca = categoryRank.has(a.category)
      ? categoryRank.get(a.category)
      : categoryOrder.length;
    const cb = categoryRank.has(b.category)
      ? categoryRank.get(b.category)
      : categoryOrder.length;
    if (ca !== cb) return ca - cb;
    return subCategoryRank(a) - subCategoryRank(b);
  });
}

/**
 * 실제 AI가 학습·인식 가능한 상품은 이 6종뿐이다 — 카탈로그 전체 상품과는
 * 별개 개념이다("카탈로그 전체 상품" vs "AI 인식 대상"). AI 인식 Mock
 * (MOCK_BASIC_CAPTURE 등)은 반드시 이 목록 안에서만 구성한다. 이름을 유일한
 * 출처로 두고, 필요하면 findProductByName으로 id/가격 등을 파생시킨다.
 */
export const AI_TRAINED_PRODUCT_NAMES = [
  '딸기 마카롱 도넛',
  '옛날 꽈배기 도넛',
  '단팥빵',
  '김치 고로케',
  '리얼초코 소라빵',
  '기분좋은 올리브 베이글',
];

export const AI_TRAINED_PRODUCTS = AI_TRAINED_PRODUCT_NAMES.map((name) =>
  findProductByName(name)
).filter(Boolean);

/**
 * Mock 재고(추정치). 실제 재고 API 연동 전까지 사용하며,
 * 매장 대시보드가 재고 0으로 관리 중인 상품을 흉내낸 매진 케이스를 일부 포함한다.
 */
export const MOCK_INVENTORY_BY_NAME = {
  흰우유: 0,
  '통밀 롤': 0,
  소금빵: 4,
  '카망베르 치즈빵': 9,
  '초코 크루아상': 6,
  '크림치즈 베이글': 5,
};

/**
 * CJ ONE 조회 실패 Mock 케이스 — 미등록 회원 시뮬레이션 전용 데모 번호.
 * 실제 회원 조회 API가 없으므로, 이 번호를 입력했을 때만 "조회 실패" 상태를
 * 재현한다(개발자용 테스트 버튼을 UI에 두지 않기 위한 최소한의 장치).
 */
export const MOCK_UNREGISTERED_PHONE = '01000000000';

/** Mock 금일 판매 수량 — "오늘의 인기 상품 TOP3" 산출에 사용한다. */
export const MOCK_SOLD_TODAY_BY_NAME = {
  '카망베르 치즈빵': 42,
  소금빵: 38,
  '초코 크루아상': 31,
  단팥빵: 27,
  '크림치즈 베이글': 20,
  '버터 크루아상': 18,
  '우유 식빵': 12,
  '마늘 바게트': 9,
};

/**
 * AI 인식 Mock 항목 생성 헬퍼 — 가격을 카탈로그(findProductByName)에서만
 * 가져와 캡처 Mock과 카탈로그 가격이 어긋나지 않도록 한다.
 * belowThreshold: 실제 연동 시 backend가 계산해 내려주는 boolean(백엔드
 * scan 스키마의 is_below_threshold와 동일 계약)을 흉내낸 값이다. 프론트에서
 * confidence 숫자로 임계값을 임의 판정하지 않고, 이미 계산된 결과만 받는다는
 * 전제를 목업에서도 그대로 유지한다.
 */
function aiCaptureItem(name, qty, confidence, belowThreshold = false) {
  const product = findProductByName(name);
  return {
    name,
    price: product.price,
    qty,
    confidence,
    source: 'ai',
    belowThreshold,
  };
}

/** 기본 촬영 AI 인식 Mock 결과 — AI 학습 대상 6종(AI_TRAINED_PRODUCT_NAMES) 안에서만 구성한다. */
export const MOCK_BASIC_CAPTURE = [
  aiCaptureItem('딸기 마카롱 도넛', 1, 97),
  aiCaptureItem('단팥빵', 2, 95),
  aiCaptureItem('김치 고로케', 1, 93, true),
];

/**
 * 추가 촬영 AI 인식 Mock 결과 — 기존 계산 항목은 유지하고 이 결과만 누적한다.
 * 단팥빵을 기본 촬영과 겹치게 두어 동일 상품 합산이 실제로 확인되게 한다.
 */
export const MOCK_ADD_CAPTURE = [
  aiCaptureItem('단팥빵', 1, 96),
  aiCaptureItem('옛날 꽈배기 도넛', 1, 94),
];

/** 다시 촬영 AI 인식 Mock 결과 — 기존 AI 인식 결과를 이 결과로 교체한다(직접 추가 항목은 유지). */
export const MOCK_RETAKE_CAPTURE = [
  aiCaptureItem('딸기 마카롱 도넛', 2, 99),
  aiCaptureItem('리얼초코 소라빵', 1, 97),
  aiCaptureItem('기분좋은 올리브 베이글', 1, 95),
];

/**
 * 트레이 내 바운딩 박스 표시 위치(Mock, 트레이 영역 기준 비율).
 * 실제 AI 이미지 좌표로 교체될 자리 — 최대 3개까지만 동시에 표시한다.
 */
export const MOCK_BBOX_SLOTS = [
  { left: '7.5%', top: 'calc(52% - 53px)', width: '188px', height: '106px' },
  {
    left: 'calc(50% - 90px)',
    top: 'calc(52% - 51px)',
    width: '180px',
    height: '102px',
  },
  { right: '7.5%', top: 'calc(52% - 54px)', width: '194px', height: '108px' },
];
