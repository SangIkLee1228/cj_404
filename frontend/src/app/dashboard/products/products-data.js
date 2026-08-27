// Dashboard 상품 마스터(S-06) 화면이 쓸 순수 데이터·UI 상수.
//
// React/브라우저 API에 의존하지 않는다. 입력·출력 item은 실제 GET
// /api/products 응답과 동일한 snake_case 구조(product_id, product_name,
// product_type, category, price, image_url, source_type,
// stock_baseline_pct, is_active)를 그대로 사용하며, camelCase로 복제·변환
// 하지 않는다. 실제 요청·Zod 검증은 api/products-api.js가 담당한다.
//
// 이 파일이 제공하는 역할은 다음과 같다.
//
//   1) buildProductsApiQuery   — 화면 조회 상태 → 실제 GET /api/products
//                                 요청 파라미터(status/product_type/
//                                 limit/offset)
//   2) mapProductsResponseToPageInfo — 목록 응답 → 화면 표시용 페이지
//                                 메타 정보
//   3) PRODUCT_PAGE_SIZE/PRODUCT_TYPE_FILTER_OPTIONS/
//      BREAD_CATEGORY_OPTIONS/DRINK_CATEGORY_OPTIONS/SOURCE_TYPE_OPTIONS
//      — 필터·폼 UI 상수(products-mock-data.js에 동일한 이름의 export가
//      남아 있지만, production runtime은 이제 이 파일의 정의만 쓴다)
//   4) buildProductCreatePayload/buildProductUpdatePayload — 상품 추가·
//      수정 폼 입력값 → 실제 POST/PATCH 요청 body(ProductCreate/
//      ProductUpdate 계약과 동일한 snake_case)로 검증·변환

// Products 표의 페이지당 노출 개수(UI 정책) = 실제 API 요청의 limit 값.
export const PRODUCT_PAGE_SIZE = 12;

// 상품 구분 필터 선택 항목. 'ALL'은 화면 필터 전용 값이며 실제 API의
// product_type 값으로는 쓰지 않는다(API가 지원하는 값은 BREAD/DRINK뿐).
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

// 공급 유형(source_type) 선택 항목. ProductRead의 필수 필드다.
export const SOURCE_TYPE_OPTIONS = [
  { value: 'IN_STORE', label: '매장 생산' },
  { value: 'FACTORY', label: '공장 공급' },
];

// 화면 조회 상태의 기본값. 상품 유형은 전체, 1페이지부터 시작. 화면이
// 실수로 이 객체를 직접 mutate해 다른 화면 상태와 뒤섞이는 일이 없도록
// freeze한다 — 다음 조회 상태가 필요하면 항상 스프레드로 복제해서 새
// 객체를 만들어야 한다.
export const DEFAULT_PRODUCTS_QUERY = Object.freeze({
  productType: 'ALL',
  page: 1,
});

// page 값을 1 이상의 정수로 보정한다. 숫자가 아니거나(NaN) 1보다 작으면
// 1로 취급한다 — buildProductsApiQuery의 내부 helper라 export하지 않는다.
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

// 실제 GET /api/products 응답을 화면 표시용 페이지 메타 정보로 변환한다.
// response.items를 그대로 쓸 뿐 다시 slice하지 않는다 — 페이지 분할은
// 이미 조회 단계(실제 API)에서 끝난 일이라는 전제다.
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

// ---- 상품 추가·수정 폼 payload builder ----
//
// backend/app/schemas/common.py::ProductCreate/ProductUpdate 계약과 맞춘
// 검증·변환이다. ProductFormModal은 이 함수들의 반환값만 보고 실제
// POST/PATCH 요청 body를 구성한다 — 모달 자체는 API를 호출하지 않는다.

const PRODUCT_TYPE_VALUES = ['BREAD', 'DRINK'];
const SOURCE_TYPE_VALUES = ['FACTORY', 'IN_STORE'];

function isValidEnumValue(value, allowedValues) {
  return typeof value === 'string' && allowedValues.includes(value);
}

// 상품명: trim 후 1~100자만 허용한다(ProductCreate/Update의
// min_length=1, max_length=100과 동일). trim된 값이 비어 있으면(공백만
// 입력) 무효로 취급한다. 유효하지 않으면 null을 돌려준다 — 호출부가
// null 여부만으로 오류를 판단할 수 있게 한다.
export function parseProductName(rawValue) {
  if (typeof rawValue !== 'string') {
    return null;
  }
  const trimmed = rawValue.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    return null;
  }
  return trimmed;
}

// 판매가·초기 수량 공통 검증: 0 이상의 안전한(safe) 정수만 허용한다.
// 빈 문자열은 Number('')===0으로 오판되지 않도록 먼저 걸러낸다. 소수·
// NaN·Infinity·음수·Number.MAX_SAFE_INTEGER 초과는 전부 무효로
// 취급하고 null을 돌려준다. API 계약에 없는 임의의 상한(예: 999)은
// 추가하지 않는다.
export function parseNonNegativeSafeInteger(rawValue) {
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return null;
  }
  const numeric = Number(rawValue);
  if (
    !Number.isFinite(numeric) ||
    !Number.isInteger(numeric) ||
    numeric < 0 ||
    numeric > Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }
  return numeric;
}

// 상품 추가(POST /api/products) payload builder. formValues를 mutate하지
// 않는다. 유효하면 { success: true, data }를, 하나라도 무효면
// { success: false, fieldErrors }를 돌려준다(fieldErrors는 무효한 필드
// 이름만 key로 갖는 얕은 객체). image_url/stock_baseline_pct는 이 폼이
// 다루지 않는 필드라 data에 절대 포함하지 않는다 — backend 기본값을
// 그대로 쓴다.
export function buildProductCreatePayload(formValues) {
  const fieldErrors = {};

  const productName = parseProductName(formValues?.productName);
  if (productName === null) {
    fieldErrors.productName = true;
  }

  const price = parseNonNegativeSafeInteger(formValues?.price);
  if (price === null) {
    fieldErrors.price = true;
  }

  const initialQty = parseNonNegativeSafeInteger(formValues?.initialQty);
  if (initialQty === null) {
    fieldErrors.initialQty = true;
  }

  const productType = formValues?.productType;
  if (!isValidEnumValue(productType, PRODUCT_TYPE_VALUES)) {
    fieldErrors.productType = true;
  }

  const sourceType = formValues?.sourceType;
  if (!isValidEnumValue(sourceType, SOURCE_TYPE_VALUES)) {
    fieldErrors.sourceType = true;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  const category =
    typeof formValues?.category === 'string' ? formValues.category : null;

  return {
    success: true,
    data: {
      product_name: productName,
      product_type: productType,
      category,
      price,
      source_type: sourceType,
      initial_qty: initialQty,
    },
  };
}

// 상품 수정(PATCH /api/products/{id}) payload builder. PATCH는 partial
// update 계약이라 이 폼이 다루지 않는 필드(initial_qty/
// stock_baseline_pct/image_url/is_active)는 data에 절대 포함하지 않는다
// — 그래야 서버가 기존 값을 그대로 보존한다. formValues를 mutate하지
// 않는다.
export function buildProductUpdatePayload(formValues) {
  const fieldErrors = {};

  const productName = parseProductName(formValues?.productName);
  if (productName === null) {
    fieldErrors.productName = true;
  }

  const price = parseNonNegativeSafeInteger(formValues?.price);
  if (price === null) {
    fieldErrors.price = true;
  }

  const productType = formValues?.productType;
  if (!isValidEnumValue(productType, PRODUCT_TYPE_VALUES)) {
    fieldErrors.productType = true;
  }

  const sourceType = formValues?.sourceType;
  if (!isValidEnumValue(sourceType, SOURCE_TYPE_VALUES)) {
    fieldErrors.sourceType = true;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  const category =
    typeof formValues?.category === 'string' ? formValues.category : null;

  return {
    success: true,
    data: {
      product_name: productName,
      product_type: productType,
      category,
      price,
      source_type: sourceType,
    },
  };
}
