/**
 * 스냅빵 직원 POS — 상품 카탈로그 / AI 인식 Mock 데이터
 * 스냅빵_직원pos.html 목업의 breadCatalog / drinkCatalog / basicCapture 등을 그대로 이식했다.
 * 실제 AI API·재고 API 연동 전까지 사용하는 Mock이며, 서버 URL은 만들지 않는다.
 */

const rawBreadCatalog = [
  { name: '우유 식빵', price: 4500, category: '식빵', emoji: '🍞' },
  { name: '통밀 식빵', price: 4700, category: '식빵', emoji: '🍞' },
  { name: '생크림 식빵', price: 5200, category: '식빵', emoji: '🍞' },
  { name: '밤식빵', price: 4900, category: '식빵', emoji: '🍞' },
  { name: '고르곤졸라 곡물빵', price: 3800, category: '건강빵', emoji: '🥖' },
  { name: '통밀 롤', price: 2300, category: '건강빵', emoji: '🥖' },
  { name: '호두 깜빠뉴', price: 4200, category: '건강빵', emoji: '🥖' },
  { name: '올리브 치아바타', price: 3600, category: '건강빵', emoji: '🥖' },
  { name: '소금빵', price: 2200, category: '간식빵', emoji: '🥐' },
  { name: '카망베르 치즈빵', price: 3200, category: '간식빵', emoji: '🥐' },
  { name: '마늘바게트', price: 3300, category: '간식빵', emoji: '🥖' },
  { name: '단팥빵', price: 2500, category: '간식빵', emoji: '🥯' },
  { name: '소보로빵', price: 2500, category: '간식빵', emoji: '🥯' },
  { name: '크림치즈 베이글', price: 3600, category: '간식빵', emoji: '🥯' },
  { name: '모카번', price: 3000, category: '간식빵', emoji: '🥯' },
  {
    name: '초코 크루아상',
    price: 3500,
    category: '파이/페이스트리',
    emoji: '🥐',
  },
  {
    name: '버터 크루아상',
    price: 3200,
    category: '파이/페이스트리',
    emoji: '🥐',
  },
  {
    name: '딸기 데니쉬',
    price: 3900,
    category: '파이/페이스트리',
    emoji: '🥧',
  },
  { name: '애플파이', price: 3600, category: '파이/페이스트리', emoji: '🥧' },
  { name: '초코 스콘', price: 2800, category: '파이/페이스트리', emoji: '🧁' },
  { name: '에그타르트', price: 2800, category: '파이/페이스트리', emoji: '🥧' },
  { name: '팥 도넛', price: 2500, category: '도넛/고로케', emoji: '🍩' },
  { name: '꽈배기 도넛', price: 2200, category: '도넛/고로케', emoji: '🍩' },
  { name: '야채 고로케', price: 3000, category: '도넛/고로케', emoji: '🥟' },
  { name: '카레 고로케', price: 3100, category: '도넛/고로케', emoji: '🥟' },
  { name: '찹쌀도넛', price: 2300, category: '도넛/고로케', emoji: '🍩' },
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
  { name: '오렌지 주스', price: 4000, category: '에이드/주스', emoji: '🧃' },
  { name: '자몽에이드', price: 4500, category: '에이드/주스', emoji: '🥤' },
  { name: '레몬에이드', price: 4300, category: '에이드/주스', emoji: '🥤' },
  { name: '청포도에이드', price: 4500, category: '에이드/주스', emoji: '🥤' },
  { name: '딸기우유', price: 3000, category: '우유/기타', emoji: '🥛' },
  { name: '흰우유', price: 2000, category: '우유/기타', emoji: '🥛' },
  { name: '생수', price: 1500, category: '우유/기타', emoji: '💧' },
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

/** Mock 금일 판매 수량 — "오늘의 인기 상품 TOP3" 산출에 사용한다. */
export const MOCK_SOLD_TODAY_BY_NAME = {
  '카망베르 치즈빵': 42,
  소금빵: 38,
  '초코 크루아상': 31,
  단팥빵: 27,
  '크림치즈 베이글': 20,
  '버터 크루아상': 18,
  '우유 식빵': 12,
  마늘바게트: 9,
};

/** 기본 촬영 AI 인식 Mock 결과 */
export const MOCK_BASIC_CAPTURE = [
  {
    name: '카망베르 치즈빵',
    price: 3200,
    qty: 1,
    confidence: 98,
    source: 'ai',
  },
  { name: '소금빵', price: 2200, qty: 2, confidence: 96, source: 'ai' },
  { name: '초코 크루아상', price: 3500, qty: 1, confidence: 94, source: 'ai' },
];

/** 추가 촬영 AI 인식 Mock 결과 — 기존 계산 항목은 유지하고 이 결과만 누적한다. */
export const MOCK_ADD_CAPTURE = [
  { name: '단팥빵', price: 2500, qty: 1, confidence: 95, source: 'ai' },
  { name: '마늘바게트', price: 3300, qty: 1, confidence: 92, source: 'ai' },
];

/** 다시 촬영 AI 인식 Mock 결과 — 기존 AI 인식 결과를 이 결과로 교체한다(직접 추가 항목은 유지). */
export const MOCK_RETAKE_CAPTURE = [
  {
    name: '카망베르 치즈빵',
    price: 3200,
    qty: 1,
    confidence: 99,
    source: 'ai',
  },
  { name: '소금빵', price: 2200, qty: 1, confidence: 98, source: 'ai' },
  {
    name: '크림치즈 베이글',
    price: 3600,
    qty: 1,
    confidence: 95,
    source: 'ai',
  },
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
