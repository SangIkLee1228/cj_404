// Dashboard 재고 관리(S-11) 화면이 쓸 순수 데이터 파생 로직.
//
// React/브라우저 API에 의존하지 않는다. 입력·출력 item은 실제 GET
// /api/inventory 응답과 동일한 snake_case 구조(product_id, product_name,
// product_type, category, image_url, produced_qty, sold_qty, remaining_qty,
// remaining_pct, stock_baseline_pct, stock_status, updated_at)를 그대로
// 사용하며, camelCase로 복제·변환하지 않는다. 실제 요청·Zod 검증은
// api/inventory-api.js가 담당한다.
//
// 이 파일이 제공하는 역할은 다음과 같다.
//
//   1) buildInventoryApiQuery   — 화면 조회 상태 → 실제 GET /api/inventory
//                                  요청 파라미터(status/product_type/
//                                  category/q/limit/offset)
//   2) mapInventoryResponseToPageInfo — InventoryListResponse → 화면
//                                  표시용 페이지 메타 정보
//   3) mapInventoryResponsesToUrgentRestockBread — 긴급 보충(OUT+LOW)
//                                  두 응답 → "지금 채워야 할 빵" view model
//   4) INVENTORY_PAGE_SIZE/PRODUCT_TYPE_FILTER_OPTIONS/
//      STOCK_STATUS_FILTER_OPTIONS/CATEGORY_FILTER_OPTIONS — 필터 UI 상수

// Inventory 표의 페이지당 노출 개수(UI 정책) = 실제 API 요청의 limit
// 값이기도 하다. inventory-mock-data.js에 동일한 이름의 export가 남아
// 있지만, production runtime은 이제 이 파일의 정의만 쓴다.
export const INVENTORY_PAGE_SIZE = 12;

// 상품 구분 필터 선택 항목. 'ALL'은 화면 필터 전용 값이며 실제 API의
// product_type 값으로는 쓰지 않는다(API가 지원하는 값은 BREAD/DRINK뿐).
export const PRODUCT_TYPE_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'BREAD', label: '빵' },
  { value: 'DRINK', label: '음료' },
];

// 재고 상태 필터 선택 항목. GET /api/inventory의 status 쿼리는 ALL|LOW|OUT만
// 허용하고(OK 단독 필터 없음) 그대로 맞췄다.
export const STOCK_STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'LOW', label: '재고 부족' },
  { value: 'OUT', label: '매진' },
];

// 세부 카테고리 필터 선택 항목. 'ALL'은 화면 필터 전용이며 실제 API의
// category 값으로는 쓰지 않는다.
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

// 화면 조회 상태의 기본값. 의미는 F1-3과 동일하다 — 상품 유형/재고 상태/
// 카테고리는 전체, 검색어는 빈 문자열, 1페이지부터 시작. F1-4가 실수로 이
// 객체를 직접 mutate해 다른 화면 상태와 뒤섞이는 일이 없도록 freeze한다 —
// 다음 조회 상태가 필요하면 항상 스프레드로 복제해서 새 객체를 만들어야
// 한다.
export const DEFAULT_INVENTORY_QUERY = Object.freeze({
  productType: 'ALL',
  stockStatus: 'ALL',
  category: 'ALL',
  query: '',
  page: 1,
});

// page 값을 1 이상의 정수로 보정한다. 숫자가 아니거나(NaN) 1보다 작으면
// 1로 취급한다 — buildInventoryApiQuery의 내부 helper라 export하지 않는다.
function resolveQueryPage(page) {
  const numericPage = Number(page);
  return Number.isFinite(numericPage)
    ? Math.max(1, Math.trunc(numericPage))
    : 1;
}

// 화면 조회 상태를 실제 GET /api/inventory 요청 파라미터로 변환한다.
// URLSearchParams에 바로 넘길 수 있는 단순한 { key: string | number } 구조를
// 반환할 뿐, 실제 URL 조립이나 fetch 호출은 하지 않는다.
export function buildInventoryApiQuery(queryState = DEFAULT_INVENTORY_QUERY) {
  const resolved = { ...DEFAULT_INVENTORY_QUERY, ...queryState };
  const page = resolveQueryPage(resolved.page);
  const limit = INVENTORY_PAGE_SIZE;
  const offset = (page - 1) * limit;

  // status는 백엔드가 ALL|LOW|OUT을 그대로 받는 쿼리 파라미터라(기본값도
  // "ALL") 생략하지 않고 항상 명시한다 — product_type과 달리 ALL 자체가
  // 유효한 계약값이다.
  const apiQuery = { status: resolved.stockStatus, limit, offset };

  // product_type은 실제 API가 BREAD|DRINK만 허용하고 ALL을 값으로 받지
  // 않으므로, 전체 조회일 때는 파라미터 자체를 생략한다.
  if (resolved.productType !== 'ALL') {
    apiQuery.product_type = resolved.productType;
  }

  // category도 실제 API가 지원하는 정식 쿼리 파라미터다(2/4 계약 확인
  // 완료). ALL은 화면 필터 전용 값이라 그때만 생략한다.
  if (resolved.category !== 'ALL') {
    apiQuery.category = resolved.category;
  }

  const trimmedQuery = (resolved.query ?? '').trim();
  if (trimmedQuery) {
    apiQuery.q = trimmedQuery;
  }

  return apiQuery;
}

// InventoryListResponse 형태의 실제 API 응답을 화면 표시용 페이지 메타
// 정보로 변환한다.
// response.items를 그대로 쓸 뿐 다시 slice하지 않는다 — 페이지 분할은 이미
// 조회 단계(Mock 또는 실제 API)에서 끝난 일이라는 전제다.
export function mapInventoryResponseToPageInfo(response) {
  const items = response?.items ?? [];
  const total =
    Number.isInteger(response?.total) && response.total >= 0
      ? response.total
      : items.length;
  const limit =
    Number.isInteger(response?.limit) && response.limit > 0
      ? response.limit
      : INVENTORY_PAGE_SIZE;
  const offset =
    Number.isInteger(response?.offset) && response.offset >= 0
      ? response.offset
      : 0;
  const updatedAt = response?.updated_at ?? null;

  if (total === 0) {
    return {
      items,
      total: 0,
      pageSize: limit,
      currentPage: 1,
      totalPages: 0,
      rangeStart: 0,
      rangeEnd: 0,
      hasPreviousPage: false,
      hasNextPage: false,
      updatedAt,
    };
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  const rangeStart = offset + 1;
  const rangeEnd = Math.min(total, offset + items.length);

  return {
    items,
    total,
    pageSize: limit,
    currentPage,
    totalPages,
    rangeStart,
    rangeEnd,
    hasPreviousPage: currentPage > 1,
    hasNextPage: rangeEnd < total,
    updatedAt,
  };
}

function toNonNegativeInt(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

// "지금 채워야 할 빵" 영역용 긴급 보충 view model. 재고 표 조회와 완전히
// 분리된 두 실제 요청(product_type=BREAD, status=OUT / status=LOW, 각각
// limit=5&offset=0)의 응답을 조합할 뿐, 직접 필터링·정렬하지 않는다 —
// 두 응답 모두 이미 서버가 remaining_qty 오름차순으로 내려주므로 이
// 함수에서 다시 정렬하지 않는다. 재고 표의 현재 페이지 items(페이지네이션
// 결과)는 이 함수에 넘기지 않는다 — 매장 전체 기준이 아니게 되어 전체
// 긴급 보충 수를 알 수 없기 때문이다.
//
// total은 outResponse.total + lowResponse.total(각 요청이 limit과 무관하게
// 돌려주는 정확한 전체 개수)이다. items는 OUT을 먼저 채우고 남는 자리만
// LOW로 채워 최대 limit개까지 노출한다. 입력 응답 객체·배열은 mutate하지
// 않는다. 응답이 비정상(total 누락 등)이어도 음수 total/remainingCount를
// 만들지 않도록 방어한다.
export function mapInventoryResponsesToUrgentRestockBread(
  outResponse,
  lowResponse,
  limit = 5
) {
  const numericLimit = Number(limit);
  const safeLimit =
    Number.isFinite(numericLimit) && numericLimit > 0
      ? Math.trunc(numericLimit)
      : 5;

  const outItems = Array.isArray(outResponse?.items) ? outResponse.items : [];
  const lowItems = Array.isArray(lowResponse?.items) ? lowResponse.items : [];
  const outTotal = toNonNegativeInt(outResponse?.total);
  const lowTotal = toNonNegativeInt(lowResponse?.total);

  const visibleItems = [...outItems, ...lowItems].slice(0, safeLimit);
  const total = outTotal + lowTotal;

  return {
    items: visibleItems,
    total,
    remainingCount: Math.max(0, total - visibleItems.length),
  };
}
