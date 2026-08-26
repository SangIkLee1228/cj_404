// Dashboard 상품 마스터(S-06) 화면이 쓸 순수 데이터 파생 로직.
//
// React/브라우저 API에 의존하지 않는다. 입력·출력 item은 Mock(및 이후 실제
// GET /api/products 응답)과 동일한 snake_case 구조(product_id,
// product_name, product_type, category, price, image_url, source_type,
// stock_baseline_pct, is_active)를 그대로 사용하며, camelCase로 복제·변환
// 하지 않는다.
//
// Inventory의 inventory-data.js와 동일한 구조를 참고했지만 그 파일을 직접
// import하지 않는다(Products는 완전히 독립적인 조회 계약을 갖는다). 이
// 파일이 제공하는 세 역할은 다음과 같다.
//
//   1) buildProductsApiQuery   — 화면 조회 상태 → 실제 API 요청 파라미터
//   2) queryMockProductsList   — (API 연결 전 임시) Mock 데이터를 실제
//                                 GET /api/products처럼 조회한 응답
//   3) mapProductsResponseToPageInfo — 목록 응답 → 화면 표시용 페이지
//                                 메타 정보
//
// ProductsPageContent는 queryMockProductsList가 돌려주는 응답 형태
// (items/total/limit/offset)만 쓰고, 전체 Mock 배열을 직접 필터링하거나
// slice하지 않는다.
import {
  PRODUCTS_MOCK_RESPONSE,
  PRODUCT_PAGE_SIZE,
} from './products-mock-data';

// 화면 조회 상태의 기본값. 상품 유형은 전체, 1페이지부터 시작. 화면이
// 실수로 이 객체를 직접 mutate해 다른 화면 상태와 뒤섞이는 일이 없도록
// freeze한다 — 다음 조회 상태가 필요하면 항상 스프레드로 복제해서 새
// 객체를 만들어야 한다.
export const DEFAULT_PRODUCTS_QUERY = Object.freeze({
  productType: 'ALL',
  page: 1,
});

// page 값을 1 이상의 정수로 보정한다. 숫자가 아니거나(NaN) 1보다 작으면
// 1로 취급한다 — buildProductsApiQuery와 queryMockProductsList가 동일한
// 보정 규칙을 공유하기 위한 내부 helper라 export하지 않는다.
function resolveQueryPage(page) {
  const numericPage = Number(page);
  return Number.isFinite(numericPage)
    ? Math.max(1, Math.trunc(numericPage))
    : 1;
}

// 화면 조회 상태를 실제 GET /api/products 요청 파라미터로 변환한다.
// URLSearchParams에 바로 넘길 수 있는 단순한 { key: string | number } 구조를
// 반환할 뿐, 실제 URL 조립이나 fetch 호출은 하지 않는다.
export function buildProductsApiQuery(queryState = DEFAULT_PRODUCTS_QUERY) {
  const resolved = { ...DEFAULT_PRODUCTS_QUERY, ...queryState };
  const page = resolveQueryPage(resolved.page);
  const limit = PRODUCT_PAGE_SIZE;
  const offset = (page - 1) * limit;

  // 상품 관리 화면은 판매중·중지 상품을 함께 봐야 한다. 백엔드 기본값은
  // "ACTIVE"라 생략하면 중지 상품이 빠지므로 status=ALL을 항상 명시한다.
  const apiQuery = { status: 'ALL', limit, offset };

  // product_type은 실제 API가 BREAD|DRINK만 허용하고 ALL을 값으로 받지
  // 않으므로, 전체 조회일 때는 파라미터 자체를 생략한다.
  if (resolved.productType !== 'ALL') {
    apiQuery.product_type = resolved.productType;
  }

  return apiQuery;
}

// API 연결 전 임시: Mock 데이터를 실제 GET /api/products처럼 조회하는 순수
// 함수. PRODUCTS_MOCK_RESPONSE.items는 이미 API와 동일한 정렬(product_type
// → category → product_name)이 적용돼 있고, 배열 filter는 살아남은 요소의
// 상대 순서를 바꾸지 않으므로 여기서 다시 정렬하지 않는다. 반환 형태는
// { items, total, limit, offset }이며, 필터를 통과한 전체 배열은 반환하지
// 않는다 — 화면은 이 함수가 돌려준 페이지 하나만 봐야 한다.
export function queryMockProductsList(queryState = DEFAULT_PRODUCTS_QUERY) {
  const resolved = { ...DEFAULT_PRODUCTS_QUERY, ...queryState };

  const filtered = PRODUCTS_MOCK_RESPONSE.items.filter((item) => {
    if (
      resolved.productType !== 'ALL' &&
      item.product_type !== resolved.productType
    ) {
      return false;
    }
    return true;
  });

  const total = filtered.length;
  const limit = PRODUCT_PAGE_SIZE;
  const page = resolveQueryPage(resolved.page);
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  return { items, total, limit, offset };
}

// 목록 응답(queryMockProductsList의 반환값, 또는 이후 실제 fetch 응답)을
// 화면 표시용 페이지 메타 정보로 변환한다. response.items를 그대로 쓸 뿐
// 다시 slice하지 않는다 — 페이지 분할은 이미 조회 단계에서 끝난 일이라는
// 전제다.
export function mapProductsResponseToPageInfo(response) {
  const items = response?.items ?? [];
  const total =
    Number.isInteger(response?.total) && response.total >= 0
      ? response.total
      : items.length;
  const limit =
    Number.isInteger(response?.limit) && response.limit > 0
      ? response.limit
      : PRODUCT_PAGE_SIZE;
  const offset =
    Number.isInteger(response?.offset) && response.offset >= 0
      ? response.offset
      : 0;

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
  };
}
