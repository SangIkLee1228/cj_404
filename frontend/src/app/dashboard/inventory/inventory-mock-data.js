// Dashboard 재고 관리(S-11) 전용 Mock 데이터.
//
// ⚠️ API 연결 전 임시 데이터입니다. 실제 GET /api/inventory 연동 시 이 파일의
// export를 API 응답으로 그대로 교체할 수 있도록, 필드명과 값 규칙을 백엔드
// 계약(backend/app/schemas/inventory.py의 InventoryListItem·
// InventoryListResponse, backend/app/api/routes/inventory.py의 계산 규칙)과
// 동일하게 맞췄습니다. remaining_pct·stock_status는 백엔드가 매 요청마다
// 계산해 내려주는 값이므로, 여기서도 완성된 값으로 미리 채워 UI가 재계산할
// 필요가 없게 했습니다.
//
// POS(frontend/src/app/pos/**)의 Mock·상태와는 아무것도 공유하지 않습니다.
// Dashboard(매니저)와 POS(직원)는 서로 다른 화면·사용자이고, 세션 공통
// 지침상 두 영역을 완전히 격리해야 하므로 재고 수치가 같은 상품을 가리켜도
// 이 파일 안에서 독립적으로 정의합니다.

// Inventory 표의 페이지당 노출 개수(UI 정책). 백엔드 쿼리 파라미터 limit의
// 기본값(50)과는 별개의, 화면 표시용 상수입니다.
export const INVENTORY_PAGE_SIZE = 12;

// 상품 구분 필터 선택 항목. 'ALL'은 화면 필터 전용 값이며 Mock item의
// product_type 값으로는 쓰지 않습니다(API가 지원하는 값은 BREAD/DRINK뿐).
export const PRODUCT_TYPE_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'BREAD', label: '빵' },
  { value: 'DRINK', label: '음료' },
];

// 재고 상태 필터 선택 항목. GET /api/inventory의 status 쿼리는 ALL|LOW|OUT만
// 허용하고(OK 단독 필터 없음), dashboard_mock.html의 필터 버튼도 동일하게
// 전체/재고 부족/매진 3개뿐이라 그대로 맞췄습니다.
export const STOCK_STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'LOW', label: '재고 부족' },
  { value: 'OUT', label: '매진' },
];

// 세부 카테고리 필터 선택 항목. dashboard_mock.html의 카테고리 select와
// 동일한 값·순서를 사용합니다. 'ALL'은 화면 필터 전용이며 Mock item의
// category 값으로는 쓰지 않습니다.
export const CATEGORY_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체 카테고리' },
  { value: '식빵', label: '식빵' },
  { value: '건강빵', label: '건강빵' },
  { value: '간식빵', label: '간식빵' },
  { value: '파이/페이스트리', label: '파이/페이스트리' },
  { value: '도넛/고로케', label: '도넛/고로케' },
  { value: '커피', label: '커피' },
  { value: '티', label: '티' },
  { value: '에이드/주스', label: '에이드/주스' },
  { value: '우유/기타', label: '우유/기타' },
];

// 모든 item이 공유하는 고정 시각. 실행 시마다 값이 바뀌는 new Date()를 쓰지
// 않기 위해 ISO 8601 문자열 하나로 고정한다(테스트·시각 검증 재현성).
const FIXED_UPDATED_AT = '2026-08-25T21:00:00+09:00';

// Inventory 목록 Mock item 배열. 필드명은 InventoryListItem과 동일한
// snake_case(product_id, product_name, ...)를 그대로 사용합니다 — 이 파일의
// 목적이 API 응답을 그대로 흉내 내는 것이라, 저장소의 일반적인 camelCase
// 관례보다 백엔드 계약 일치를 우선했습니다.
//
// remaining_pct = round(remaining_qty / produced_qty * 100, 1)
// stock_status  = remaining_qty <= 0 ? 'OUT'
//               : remaining_pct <= stock_baseline_pct ? 'LOW'
//               : 'OK'
// (백엔드와 동일하게 BREAD/DRINK 구분 없이 동일한 규칙을 적용합니다.)
//
// 이 배열 자체는 원본 상품 데이터로, 정렬 순서는 카탈로그 입력 순서(구분 →
// 카테고리)일 뿐 API 응답 순서 계약이 아닙니다. GET /api/inventory가 실제로
// 내려주는 순서는 아래 INVENTORY_MOCK_RESPONSE.items를 참고하세요.
export const INVENTORY_MOCK_ITEMS = [
  // --- 빵: 식빵 ---
  {
    product_id: 1,
    product_name: '우유 식빵',
    product_type: 'BREAD',
    category: '식빵',
    produced_qty: 20,
    sold_qty: 5,
    remaining_qty: 15,
    remaining_pct: 75.0,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    // stock_baseline_pct(15)가 기본값(20)과 달라도 판정이 그대로 반영되는지
    // 검증하는 항목. 기본 20 기준이었다면 22.2%는 여전히 OK라 상태 자체는
    // 바뀌지 않지만, 기준값 필드가 응답에 그대로 실려오는지 확인할 수 있다.
    product_id: 2,
    product_name: '통밀 식빵',
    product_type: 'BREAD',
    category: '식빵',
    produced_qty: 18,
    sold_qty: 14,
    remaining_qty: 4,
    remaining_pct: 22.2,
    stock_baseline_pct: 15,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 3,
    product_name: '생크림 식빵',
    product_type: 'BREAD',
    category: '식빵',
    produced_qty: 14,
    sold_qty: 6,
    remaining_qty: 8,
    remaining_pct: 57.1,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 4,
    product_name: '밤식빵',
    product_type: 'BREAD',
    category: '식빵',
    produced_qty: 16,
    sold_qty: 9,
    remaining_qty: 7,
    remaining_pct: 43.8,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },

  // --- 빵: 건강빵 ---
  {
    product_id: 5,
    product_name: '고르곤졸라 곡물빵',
    product_type: 'BREAD',
    category: '건강빵',
    produced_qty: 20,
    sold_qty: 17,
    remaining_qty: 3,
    remaining_pct: 15.0,
    stock_baseline_pct: 20,
    stock_status: 'LOW',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    // id5와 remaining_pct(15.0)는 같지만 stock_baseline_pct가 10이라 LOW가
    // 아닌 OK로 판정된다 — 기준값이 상품별로 판정에 반영되는지 검증한다.
    product_id: 6,
    product_name: '통밀 롤',
    product_type: 'BREAD',
    category: '건강빵',
    produced_qty: 20,
    sold_qty: 17,
    remaining_qty: 3,
    remaining_pct: 15.0,
    stock_baseline_pct: 10,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 7,
    product_name: '호두 깜빠뉴',
    product_type: 'BREAD',
    category: '건강빵',
    produced_qty: 10,
    sold_qty: 6,
    remaining_qty: 4,
    remaining_pct: 40.0,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 8,
    product_name: '올리브 치아바타',
    product_type: 'BREAD',
    category: '건강빵',
    produced_qty: 14,
    sold_qty: 9,
    remaining_qty: 5,
    remaining_pct: 35.7,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },

  // --- 빵: 간식빵 ---
  {
    product_id: 9,
    product_name: '소금빵',
    product_type: 'BREAD',
    category: '간식빵',
    produced_qty: 12,
    sold_qty: 12,
    remaining_qty: 0,
    remaining_pct: 0.0,
    stock_baseline_pct: 20,
    stock_status: 'OUT',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 10,
    product_name: '카망베르 치즈빵',
    product_type: 'BREAD',
    category: '간식빵',
    produced_qty: 12,
    sold_qty: 10,
    remaining_qty: 2,
    remaining_pct: 16.7,
    stock_baseline_pct: 20,
    stock_status: 'LOW',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 11,
    product_name: '마늘바게트',
    product_type: 'BREAD',
    category: '간식빵',
    produced_qty: 16,
    sold_qty: 9,
    remaining_qty: 7,
    remaining_pct: 43.8,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 12,
    product_name: '단팥빵',
    product_type: 'BREAD',
    category: '간식빵',
    produced_qty: 18,
    sold_qty: 7,
    remaining_qty: 11,
    remaining_pct: 61.1,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 13,
    product_name: '크림치즈 베이글',
    product_type: 'BREAD',
    category: '간식빵',
    produced_qty: 11,
    sold_qty: 11,
    remaining_qty: 0,
    remaining_pct: 0.0,
    stock_baseline_pct: 20,
    stock_status: 'OUT',
    updated_at: FIXED_UPDATED_AT,
  },

  // --- 빵: 파이/페이스트리 ---
  {
    product_id: 14,
    product_name: '초코 크루아상',
    product_type: 'BREAD',
    category: '파이/페이스트리',
    produced_qty: 15,
    sold_qty: 8,
    remaining_qty: 7,
    remaining_pct: 46.7,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 15,
    product_name: '딸기 데니쉬',
    product_type: 'BREAD',
    category: '파이/페이스트리',
    produced_qty: 8,
    sold_qty: 8,
    remaining_qty: 0,
    remaining_pct: 0.0,
    stock_baseline_pct: 20,
    stock_status: 'OUT',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 16,
    product_name: '애플파이',
    product_type: 'BREAD',
    category: '파이/페이스트리',
    produced_qty: 12,
    sold_qty: 9,
    remaining_qty: 3,
    remaining_pct: 25.0,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },

  // --- 빵: 도넛/고로케 ---
  {
    product_id: 17,
    product_name: '팥 도넛',
    product_type: 'BREAD',
    category: '도넛/고로케',
    produced_qty: 14,
    sold_qty: 8,
    remaining_qty: 6,
    remaining_pct: 42.9,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 18,
    product_name: '야채 고로케',
    product_type: 'BREAD',
    category: '도넛/고로케',
    produced_qty: 12,
    sold_qty: 10,
    remaining_qty: 2,
    remaining_pct: 16.7,
    stock_baseline_pct: 20,
    stock_status: 'LOW',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 19,
    product_name: '카레 고로케',
    product_type: 'BREAD',
    category: '도넛/고로케',
    produced_qty: 11,
    sold_qty: 5,
    remaining_qty: 6,
    remaining_pct: 54.5,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    // category가 null인 검증용 항목(백엔드 PRODUCT.category는 nullable).
    // 화면이 카테고리 없는 상품도 깨지지 않고 표시하는지 확인하는 용도이며,
    // null을 임의 문자열로 바꾸지 않는다.
    product_id: 20,
    product_name: '시즌 한정 미분류 빵',
    product_type: 'BREAD',
    category: null,
    produced_qty: 10,
    sold_qty: 3,
    remaining_qty: 7,
    remaining_pct: 70.0,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },

  // --- 음료: 커피 ---
  {
    product_id: 21,
    product_name: '아이스 아메리카노',
    product_type: 'DRINK',
    category: '커피',
    produced_qty: 28,
    sold_qty: 10,
    remaining_qty: 18,
    remaining_pct: 64.3,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 22,
    product_name: '카페라떼',
    product_type: 'DRINK',
    category: '커피',
    produced_qty: 24,
    sold_qty: 15,
    remaining_qty: 9,
    remaining_pct: 37.5,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    // stock_baseline_pct가 30으로 기본값보다 높아, 기본 20 기준이면 OK였을
    // 25.0%가 LOW로 뒤집힌다 — 음료도 빵과 동일한 규칙(퍼센트 기준, 유형
    // 무관)로 판정됨을 보여주는 항목.
    product_id: 23,
    product_name: '카푸치노',
    product_type: 'DRINK',
    category: '커피',
    produced_qty: 20,
    sold_qty: 15,
    remaining_qty: 5,
    remaining_pct: 25.0,
    stock_baseline_pct: 30,
    stock_status: 'LOW',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 24,
    product_name: '콜드브루',
    product_type: 'DRINK',
    category: '커피',
    produced_qty: 16,
    sold_qty: 16,
    remaining_qty: 0,
    remaining_pct: 0.0,
    stock_baseline_pct: 20,
    stock_status: 'OUT',
    updated_at: FIXED_UPDATED_AT,
  },

  // --- 음료: 티 ---
  {
    product_id: 25,
    product_name: '유자차',
    product_type: 'DRINK',
    category: '티',
    produced_qty: 14,
    sold_qty: 12,
    remaining_qty: 2,
    remaining_pct: 14.3,
    stock_baseline_pct: 20,
    stock_status: 'LOW',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 26,
    product_name: '얼그레이티',
    product_type: 'DRINK',
    category: '티',
    produced_qty: 18,
    sold_qty: 6,
    remaining_qty: 12,
    remaining_pct: 66.7,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },

  // --- 음료: 에이드/주스 ---
  {
    product_id: 27,
    product_name: '오렌지 주스',
    product_type: 'DRINK',
    category: '에이드/주스',
    produced_qty: 16,
    sold_qty: 9,
    remaining_qty: 7,
    remaining_pct: 43.8,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 28,
    product_name: '자몽에이드',
    product_type: 'DRINK',
    category: '에이드/주스',
    produced_qty: 14,
    sold_qty: 14,
    remaining_qty: 0,
    remaining_pct: 0.0,
    stock_baseline_pct: 20,
    stock_status: 'OUT',
    updated_at: FIXED_UPDATED_AT,
  },

  // --- 음료: 우유/기타 ---
  {
    product_id: 29,
    product_name: '딸기우유',
    product_type: 'DRINK',
    category: '우유/기타',
    produced_qty: 20,
    sold_qty: 8,
    remaining_qty: 12,
    remaining_pct: 60.0,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
  {
    product_id: 30,
    product_name: '흰우유',
    product_type: 'DRINK',
    category: '우유/기타',
    produced_qty: 26,
    sold_qty: 6,
    remaining_qty: 20,
    remaining_pct: 76.9,
    stock_baseline_pct: 20,
    stock_status: 'OK',
    updated_at: FIXED_UPDATED_AT,
  },
];

// backend/app/api/routes/inventory.py list_inventory의 정렬 계약: 상태
// 우선순위(OUT → LOW → OK) 다음 remaining_qty 오름차순. UI가 다시 정렬할
// 필요가 없도록 응답 Mock 자체를 이 순서로 미리 맞춰 둔다. 이 우선순위 맵과
// 정렬은 아래 응답 조립에만 쓰는 내부용이라 export하지 않는다.
const STOCK_STATUS_SORT_PRIORITY = { OUT: 0, LOW: 1, OK: 2 };

// INVENTORY_MOCK_ITEMS(원본, 카탈로그 순서)를 그대로 두고 복사본만 정렬해,
// 원본 export가 이 파일 로드 시점에 mutate되지 않도록 한다.
const INVENTORY_MOCK_RESPONSE_ITEMS = [...INVENTORY_MOCK_ITEMS].sort(
  (a, b) =>
    STOCK_STATUS_SORT_PRIORITY[a.stock_status] -
      STOCK_STATUS_SORT_PRIORITY[b.stock_status] ||
    a.remaining_qty - b.remaining_qty
);

// InventoryListResponse와 동일한 구조의 Mock 응답. limit은 이 파일의 UI 표시
// 정책(INVENTORY_PAGE_SIZE=12)이 아니라, 쿼리 파라미터를 생략했을 때 백엔드가
// 쓰는 기본값(GET /api/inventory limit 기본값 50)을 그대로 반영한다 — 필터·
// 페이지네이션 없이 한 번에 내려오는 "기본 조회" 응답을 흉내 낸다.
export const INVENTORY_MOCK_RESPONSE = {
  items: INVENTORY_MOCK_RESPONSE_ITEMS,
  total: INVENTORY_MOCK_ITEMS.length,
  limit: 50,
  offset: 0,
  updated_at: FIXED_UPDATED_AT,
};
