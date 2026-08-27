// Dashboard 상품 마스터(S-06) 전용 Mock 데이터.
//
// ⚠️ API 연결 전 임시 데이터입니다. 실제 GET /api/products 연동 시 이 파일의
// export를 API 응답으로 그대로 교체할 수 있도록, 필드명과 값 규칙을 백엔드
// 계약(backend/app/schemas/common.py의 ProductRead,
// backend/app/api/routes/products.py의 정렬 규칙)과 동일하게 맞췄습니다.
//
// POS(frontend/src/app/pos/**)의 Mock·상태와는 아무것도 공유하지 않습니다.
// Dashboard(매니저)와 POS(직원)는 서로 다른 화면·사용자이고, 세션 공통
// 지침상 두 영역을 완전히 격리해야 하므로 상품 정보가 겹치더라도 이 파일
// 안에서 독립적으로 정의합니다. Inventory 페이지의 Mock 파일도 참고하지
// 않습니다(같은 상품명을 다룰 수 있지만 완전히 별개의 데이터입니다).

// Products 표의 페이지당 노출 개수(UI 정책).
export const PRODUCT_PAGE_SIZE = 12;

// 상품 구분 필터 선택 항목. 'ALL'은 화면 필터 전용 값이며 Mock item의
// product_type 값으로는 쓰지 않습니다(API가 지원하는 값은 BREAD/DRINK뿐).
export const PRODUCT_TYPE_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'BREAD', label: '빵' },
  { value: 'DRINK', label: '음료' },
];

// 상품 추가·수정 폼의 카테고리 선택 항목. product_type에 따라 서로 다른
// 목록을 쓴다 — dashboard_mock.html의 breadCats/drinkCats와 동일한 값·순서.
export const BREAD_CATEGORY_OPTIONS = [
  { value: '식빵', label: '식빵' },
  { value: '건강빵', label: '건강빵' },
  { value: '간식빵', label: '간식빵' },
  { value: '파이/페이스트리', label: '파이/페이스트리' },
  { value: '도넛/고로케', label: '도넛/고로케' },
];

export const DRINK_CATEGORY_OPTIONS = [
  { value: '커피', label: '커피' },
  { value: '티', label: '티' },
  { value: '에이드/주스', label: '에이드/주스' },
  { value: '우유/기타', label: '우유/기타' },
];

// 공급 유형(source_type) 선택 항목. ProductRead의 필수 필드라 목업에는
// 없지만 폼에 추가했다(완료 보고에도 기록).
export const SOURCE_TYPE_OPTIONS = [
  { value: 'IN_STORE', label: '매장 생산' },
  { value: 'FACTORY', label: '공장 공급' },
];

// Products 목록 Mock item 배열. 필드명은 ProductRead와 동일한 snake_case를
// 그대로 사용한다. dashboard_mock.html의 MASTER_PRODUCTS에서 상품명·유형·
// 카테고리·가격만 그대로 가져왔고, API item에 없는 productId 문자열·emoji·
// initialQty·aiClassLabel은 옮기지 않았다.
//
// source_type과 stock_baseline_pct는 목업 데이터에 없는 필드라 이 Mock에서
// 새로 배분했다:
// - source_type: 목업에 대응 데이터가 없어 다양성 확보를 위해 임의로 섞어
//   배분했다(업무적 의미를 반영한 값이 아니다).
// - stock_baseline_pct: BREAD는 대부분 20(목업 baselinePct와 동일), 일부만
//   15/25로 변형해 "재고율 N% 이하" 표시를 검증할 수 있게 했다. DRINK는
//   채움 기준 개념이 적용되지 않는다고 보고 null로 뒀다("-" 표시 검증용).
// is_active는 6개만 false로 둬 "중지" 배지를 검증할 수 있게 했고, 나머지는
// 모두 활성 상태다.
export const PRODUCTS_MOCK_ITEMS = [
  // --- 빵: 식빵 ---
  {
    product_id: 1,
    product_name: '우유 식빵',
    product_type: 'BREAD',
    category: '식빵',
    price: 4500,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 2,
    product_name: '통밀 식빵',
    product_type: 'BREAD',
    category: '식빵',
    price: 4700,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 3,
    product_name: '생크림 식빵',
    product_type: 'BREAD',
    category: '식빵',
    price: 5200,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 4,
    product_name: '밤식빵',
    product_type: 'BREAD',
    category: '식빵',
    price: 4900,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: 20,
    is_active: true,
  },

  // --- 빵: 건강빵 ---
  {
    // is_active=false 검증용
    product_id: 5,
    product_name: '고르곤졸라 곡물빵',
    product_type: 'BREAD',
    category: '건강빵',
    price: 3800,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: false,
  },
  {
    product_id: 6,
    product_name: '통밀 롤',
    product_type: 'BREAD',
    category: '건강빵',
    price: 2300,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 7,
    product_name: '호두 깜빠뉴',
    product_type: 'BREAD',
    category: '건강빵',
    price: 4200,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 8,
    product_name: '올리브 치아바타',
    product_type: 'BREAD',
    category: '건강빵',
    price: 3600,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },

  // --- 빵: 간식빵 ---
  {
    // stock_baseline_pct=15 검증용
    product_id: 9,
    product_name: '소금빵',
    product_type: 'BREAD',
    category: '간식빵',
    price: 2200,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 15,
    is_active: true,
  },
  {
    product_id: 10,
    product_name: '카망베르 치즈빵',
    product_type: 'BREAD',
    category: '간식빵',
    price: 3200,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    // is_active=false + stock_baseline_pct=25 검증용
    product_id: 11,
    product_name: '마늘바게트',
    product_type: 'BREAD',
    category: '간식빵',
    price: 3300,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 25,
    is_active: false,
  },
  {
    product_id: 12,
    product_name: '단팥빵',
    product_type: 'BREAD',
    category: '간식빵',
    price: 2500,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 13,
    product_name: '소보로빵',
    product_type: 'BREAD',
    category: '간식빵',
    price: 2500,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 14,
    product_name: '크림치즈 베이글',
    product_type: 'BREAD',
    category: '간식빵',
    price: 3600,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 15,
    product_name: '모카번',
    product_type: 'BREAD',
    category: '간식빵',
    price: 3000,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },

  // --- 빵: 파이/페이스트리 ---
  {
    product_id: 16,
    product_name: '초코 크루아상',
    product_type: 'BREAD',
    category: '파이/페이스트리',
    price: 3500,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 17,
    product_name: '버터 크루아상',
    product_type: 'BREAD',
    category: '파이/페이스트리',
    price: 3200,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    // is_active=false 검증용
    product_id: 18,
    product_name: '딸기 데니쉬',
    product_type: 'BREAD',
    category: '파이/페이스트리',
    price: 3900,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 15,
    is_active: false,
  },
  {
    product_id: 19,
    product_name: '애플파이',
    product_type: 'BREAD',
    category: '파이/페이스트리',
    price: 3600,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 20,
    product_name: '초코 스콘',
    product_type: 'BREAD',
    category: '파이/페이스트리',
    price: 2800,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 21,
    product_name: '에그타르트',
    product_type: 'BREAD',
    category: '파이/페이스트리',
    price: 2800,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },

  // --- 빵: 도넛/고로케 ---
  {
    product_id: 22,
    product_name: '팥 도넛',
    product_type: 'BREAD',
    category: '도넛/고로케',
    price: 2500,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: 25,
    is_active: true,
  },
  {
    product_id: 23,
    product_name: '꽈배기 도넛',
    product_type: 'BREAD',
    category: '도넛/고로케',
    price: 2200,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    // is_active=false 검증용
    product_id: 24,
    product_name: '야채 고로케',
    product_type: 'BREAD',
    category: '도넛/고로케',
    price: 3000,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: false,
  },
  {
    product_id: 25,
    product_name: '카레 고로케',
    product_type: 'BREAD',
    category: '도넛/고로케',
    price: 3100,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: 20,
    is_active: true,
  },
  {
    product_id: 26,
    product_name: '찹쌀도넛',
    product_type: 'BREAD',
    category: '도넛/고로케',
    price: 2300,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: 20,
    is_active: true,
  },

  // --- 음료: 커피 ---
  {
    product_id: 27,
    product_name: '아이스 아메리카노',
    product_type: 'DRINK',
    category: '커피',
    price: 3500,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: null,
    is_active: true,
  },
  {
    product_id: 28,
    product_name: '카페라떼',
    product_type: 'DRINK',
    category: '커피',
    price: 4000,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: null,
    is_active: true,
  },
  {
    product_id: 29,
    product_name: '바닐라 라떼',
    product_type: 'DRINK',
    category: '커피',
    price: 4500,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: null,
    is_active: true,
  },
  {
    product_id: 30,
    product_name: '카푸치노',
    product_type: 'DRINK',
    category: '커피',
    price: 4200,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: null,
    is_active: true,
  },
  {
    // is_active=false 검증용
    product_id: 31,
    product_name: '콜드브루',
    product_type: 'DRINK',
    category: '커피',
    price: 4300,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: null,
    is_active: false,
  },

  // --- 음료: 티 ---
  {
    product_id: 32,
    product_name: '유자차',
    product_type: 'DRINK',
    category: '티',
    price: 3800,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: null,
    is_active: true,
  },
  {
    product_id: 33,
    product_name: '얼그레이티',
    product_type: 'DRINK',
    category: '티',
    price: 3500,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: null,
    is_active: true,
  },
  {
    product_id: 34,
    product_name: '복숭아 아이스티',
    product_type: 'DRINK',
    category: '티',
    price: 3500,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: null,
    is_active: true,
  },

  // --- 음료: 에이드/주스 ---
  {
    product_id: 35,
    product_name: '오렌지 주스',
    product_type: 'DRINK',
    category: '에이드/주스',
    price: 4000,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: null,
    is_active: true,
  },
  {
    product_id: 36,
    product_name: '자몽에이드',
    product_type: 'DRINK',
    category: '에이드/주스',
    price: 4500,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: null,
    is_active: true,
  },
  {
    product_id: 37,
    product_name: '레몬에이드',
    product_type: 'DRINK',
    category: '에이드/주스',
    price: 4300,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: null,
    is_active: true,
  },
  {
    product_id: 38,
    product_name: '청포도에이드',
    product_type: 'DRINK',
    category: '에이드/주스',
    price: 4500,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: null,
    is_active: true,
  },

  // --- 음료: 우유/기타 ---
  {
    // is_active=false 검증용
    product_id: 39,
    product_name: '딸기우유',
    product_type: 'DRINK',
    category: '우유/기타',
    price: 3000,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: null,
    is_active: false,
  },
  {
    product_id: 40,
    product_name: '흰우유',
    product_type: 'DRINK',
    category: '우유/기타',
    price: 2000,
    image_url: null,
    source_type: 'FACTORY',
    stock_baseline_pct: null,
    is_active: true,
  },
  {
    product_id: 41,
    product_name: '생수',
    product_type: 'DRINK',
    category: '우유/기타',
    price: 1500,
    image_url: null,
    source_type: 'IN_STORE',
    stock_baseline_pct: null,
    is_active: true,
  },
];

// backend/app/api/routes/products.py list_products의 정렬 계약:
// .order('product_type').order('category').order('product_name'). 문자열
// 오름차순 비교만 쓰고('BREAD' < 'DRINK'라 상품 구분 정렬은 자연히
// 성립한다), 별도 우선순위 맵은 두지 않는다.
function compareProducts(a, b) {
  if (a.product_type !== b.product_type) {
    return a.product_type < b.product_type ? -1 : 1;
  }
  const categoryA = a.category ?? '';
  const categoryB = b.category ?? '';
  if (categoryA !== categoryB) {
    return categoryA < categoryB ? -1 : 1;
  }
  if (a.product_name === b.product_name) {
    return 0;
  }
  return a.product_name < b.product_name ? -1 : 1;
}

// PRODUCTS_MOCK_ITEMS(원본, 카탈로그 입력 순서)는 그대로 두고 복사본만
// 정렬해 원본 export가 mutate되지 않게 한다.
const PRODUCTS_MOCK_RESPONSE_ITEMS = [...PRODUCTS_MOCK_ITEMS].sort(
  compareProducts
);

// GET /api/products 응답과 동일한 shape의 Mock 응답. 이 API는 updated_at을
// 내려주지 않으므로 임의로 추가하지 않는다. limit은 쿼리 파라미터를
// 생략했을 때 백엔드가 쓰는 기본값(50)을 반영한다.
export const PRODUCTS_MOCK_RESPONSE = {
  items: PRODUCTS_MOCK_RESPONSE_ITEMS,
  total: PRODUCTS_MOCK_ITEMS.length,
  limit: 50,
  offset: 0,
};
