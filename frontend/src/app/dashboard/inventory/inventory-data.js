// Dashboard 재고 관리(S-11) 화면이 쓸 순수 데이터 파생 로직.
//
// React/브라우저 API에 의존하지 않는다. 입력·출력 item은 F1-2 Mock(및 이후
// 실제 GET /api/inventory 응답)과 동일한 snake_case 구조(product_id,
// product_name, product_type, category, produced_qty, sold_qty,
// remaining_qty, remaining_pct, stock_baseline_pct, stock_status,
// updated_at)를 그대로 사용하며, camelCase로 복제·변환하지 않는다.
//
// F1-3R부터는 "화면이 전체 배열을 받아 직접 필터링/slice"하는 구조를 버리고,
// 실제 백엔드 GET /api/inventory와 같은 모양의 계약으로 정리했다. 이 파일이
// 제공하는 세 역할은 다음과 같다.
//
//   1) buildInventoryApiQuery   — 화면 조회 상태 → 실제 API 요청 파라미터
//   2) queryMockInventoryList   — (API 연결 전 임시) Mock 데이터를 실제
//                                  GET /api/inventory처럼 조회한 응답
//   3) mapInventoryResponseToPageInfo — InventoryListResponse 형태의 응답
//                                  → 화면 표시용 페이지 메타 정보
//
// F1-4 Client Component는 queryMockInventoryList가 돌려주는
// InventoryListResponse 형태(items/total/limit/offset/updated_at)만 쓰고,
// 전체 Mock 배열을 직접 필터링하거나 slice하지 않는다. 실제 API 연결 시
// queryMockInventoryList 호출을 fetch(`/api/inventory?...`) 호출로 그대로
// 바꿔치기할 수 있어야 한다는 게 이 구조의 목적이다.
import {
  INVENTORY_MOCK_RESPONSE,
  INVENTORY_PAGE_SIZE,
} from './inventory-mock-data';

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
// 1로 취급한다 — buildInventoryApiQuery와 queryMockInventoryList가 동일한
// 보정 규칙을 공유하기 위한 내부 helper라 export하지 않는다.
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

  const trimmedQuery = (resolved.query ?? '').trim();
  if (trimmedQuery) {
    apiQuery.q = trimmedQuery;
  }

  // category는 실제 GET /api/inventory가 지원하지 않는 파라미터라 절대
  // 포함하지 않는다 — Mock 전용 조건은 queryMockInventoryList 쪽 주석 참고.
  return apiQuery;
}

// API 연결 전 임시: F1-2 Mock 데이터를 실제 GET /api/inventory처럼 조회하는
// 순수 함수. 처리 순서는 상품 유형 → 재고 상태 → 상품명 검색 → 카테고리
// (Mock 전용) 필터 → total 계산 → offset/limit 페이지 추출이며, 반환 형태는
// InventoryListResponse(items/total/limit/offset/updated_at)와 동일하다.
// 필터를 통과한 전체 배열(filteredItems)은 반환하지 않는다 — 화면은 이
// 함수가 돌려준 페이지 하나만 봐야 한다.
//
// [category 임시 정책]
// 실제 GET /api/inventory는 category 파라미터를 지원하지 않지만,
// dashboard_mock.html의 카테고리 필터 UI/상호작용을 API 연동 전에 검증할
// 수 있도록 이 Mock 조회 함수에서만 category 조건을 지원한다.
// - category는 buildInventoryApiQuery의 실제 API 쿼리에는 절대 포함되지
//   않는, 이 Mock 조회 전용 조건이다.
// - 반드시 total을 계산하기 *전에* 적용해야 한다. 현재 페이지 items(응답의
//   items)에만 나중에 category 필터를 걸면 total·totalPages가 실제로
//   맞는 개수와 어긋난다.
// - 실제 API 연동 전까지 "백엔드에 category 필터를 추가할지" 또는
//   "카테고리 필터 UI 정책 자체를 재검토할지" 결정이 필요하다.
export function queryMockInventoryList(queryState = DEFAULT_INVENTORY_QUERY) {
  const resolved = { ...DEFAULT_INVENTORY_QUERY, ...queryState };
  const normalizedQuery = (resolved.query ?? '').trim().toLowerCase();

  // INVENTORY_MOCK_RESPONSE.items는 이미 API와 동일한 정렬(OUT → LOW → OK,
  // 동일 상태에서는 remaining_qty 오름차순, 그 다음 product_id 오름차순)이
  // 적용돼 있다. 배열 filter는 살아남은 요소의 상대 순서를 바꾸지 않으므로
  // 여기서 다시 정렬할 필요가 없다.
  const filtered = INVENTORY_MOCK_RESPONSE.items.filter((item) => {
    if (
      resolved.productType !== 'ALL' &&
      item.product_type !== resolved.productType
    ) {
      return false;
    }
    if (
      resolved.stockStatus !== 'ALL' &&
      item.stock_status !== resolved.stockStatus
    ) {
      return false;
    }
    if (
      normalizedQuery &&
      !item.product_name.toLowerCase().includes(normalizedQuery)
    ) {
      return false;
    }
    // Mock 전용 카테고리 조건 — 위 [category 임시 정책] 참고.
    if (resolved.category !== 'ALL' && item.category !== resolved.category) {
      return false;
    }
    return true;
  });

  const total = filtered.length;
  const limit = INVENTORY_PAGE_SIZE;
  const page = resolveQueryPage(resolved.page);
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  return {
    items,
    total,
    limit,
    offset,
    updated_at: INVENTORY_MOCK_RESPONSE.updated_at,
  };
}

// InventoryListResponse 형태의 응답(queryMockInventoryList의 반환값, 또는
// 이후 실제 fetch 응답)을 화면 표시용 페이지 메타 정보로 변환한다.
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

// "지금 채워야 할 빵" 영역용 긴급 보충 대상 계산. BREAD이면서 LOW/OUT인
// item만 대상으로 하고(음료는 재고 표에는 나오지만 이 영역에는 포함하지
// 않는다), OUT → LOW → remaining_qty 오름차순 → product_id 오름차순으로
// 정렬한 뒤 상위 limit개만 노출용으로 잘라낸다. 입력 배열은 mutate하지
// 않는다.
//
// [데이터 계약 — 반드시 지킬 것]
// 1. 이 함수에 queryMockInventoryList가 반환한 "현재 페이지" items만 넘기면
//    페이지에 없는 LOW/OUT 빵이 누락되어 전체 긴급 보충 수를 알 수 없다.
// 2. 반드시 별도로 조회된 BREAD 재고 전체 데이터, 또는 Mock 전체 데이터
//    (예: INVENTORY_MOCK_RESPONSE.items)에 대해 호출해야 한다.
// 3. F1-4는 재고 표의 response.items(페이지네이션된 결과)를 이 함수에 그대로
//    넘기지 않는다.
// 4. 실제 API 연결 시에도 긴급 보충 영역은 재고 표 조회와 별개의 조회
//    전략(예: 상태 필터만 걸고 limit을 크게 잡아 한 번에 받아오는 방식 등)이
//    필요하다 — 이번 단계에서는 그 전략을 구현하지 않는다.
export function getUrgentRestockBread(items, limit = 5) {
  const numericLimit = Number(limit);
  const safeLimit =
    Number.isFinite(numericLimit) && numericLimit > 0
      ? Math.trunc(numericLimit)
      : 5;

  const statusPriority = { OUT: 0, LOW: 1 };
  const candidates = items.filter(
    (item) =>
      item.product_type === 'BREAD' &&
      (item.stock_status === 'LOW' || item.stock_status === 'OUT')
  );

  const sorted = [...candidates].sort(
    (a, b) =>
      statusPriority[a.stock_status] - statusPriority[b.stock_status] ||
      a.remaining_qty - b.remaining_qty ||
      a.product_id - b.product_id
  );

  const total = sorted.length;
  const visibleItems = sorted.slice(0, safeLimit);

  return {
    items: visibleItems,
    total,
    remainingCount: total - visibleItems.length,
  };
}
