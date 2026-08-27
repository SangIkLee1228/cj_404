// Dashboard 상품 마스터(S-06) 전용 실제 API 연결.
//
// GET/POST/PATCH /api/products의 query key, 요청 함수, 요청/응답 Zod
// 스키마를 담는다. 화면 view model 매핑(페이지 메타)과 폼 입력값 →
// snake_case payload 변환은 이 파일이 아니라 ../products/products-data.js
// (buildProductCreatePayload/buildProductUpdatePayload)가 담당한다 — 이
// 파일은 그 payload를 받아 "실제 네트워크 요청 + 계약 검증"까지만
// 책임진다.
import { z } from 'zod';
import { requestDashboardJson, DashboardApiError } from './dashboard-api';
import { buildProductsApiQuery } from '../products/products-data';

// query key namespace: ['dashboard', 'products', ...]
export const productsQueryKeys = {
  all: ['dashboard', 'products'],
  lists: () => ['dashboard', 'products', 'list'],
  list: (normalizedQuery) => ['dashboard', 'products', 'list', normalizedQuery],
};

// backend/app/schemas/common.py::ProductRead 계약. category/image_url은
// OpenAPI required 목록에 없는 nullable 필드(서버 기본값 None), 항상 키
// 자체는 내려온다. stock_baseline_pct는 nullable + 서버 기본값 20이지만
// 계약상 여전히 null이 될 수 있으므로(예: DRINK 등) nullable을 유지한다.
// is_active는 서버 기본값 true. initial_qty는 POST 전용 필드라 이 응답
// 스키마에는 없다.
const productReadSchema = z.object({
  product_id: z.number().int(),
  product_name: z.string(),
  product_type: z.enum(['BREAD', 'DRINK']),
  category: z.string().nullable(),
  price: z.number().int().nonnegative(),
  image_url: z.string().nullable(),
  source_type: z.enum(['FACTORY', 'IN_STORE']),
  stock_baseline_pct: z.number().int().min(0).max(100).nullable(),
  is_active: z.boolean(),
});

// backend/app/schemas/common.py::ProductListResponse 계약.
const productListResponseSchema = z.object({
  items: z.array(productReadSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

/**
 * 화면 조회 상태(queryState)를 buildProductsApiQuery로 변환해 실제
 * GET /api/products를 호출한다. React Query가 전달한 signal은 그대로
 * requestDashboardJson → apiFetch까지 전달된다.
 */
export async function fetchProductsList(queryState, { signal } = {}) {
  const params = buildProductsApiQuery(queryState);
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    search.set(key, String(value));
  });

  const raw = await requestDashboardJson(`/products?${search}`, { signal });

  const result = productListResponseSchema.safeParse(raw);
  if (!result.success) {
    // 원본 응답이나 Zod issue 전체는 화면에 노출하지 않는다. 어떤 필드
    // 경로가 계약과 어긋났는지는 개발자 콘솔에만 요약(path + message)해
    // 남긴다 — 응답 값 자체는 기록하지 않는다.
    if (typeof console !== 'undefined') {
      console.error(
        '[products-api] 상품 목록 응답이 계약과 일치하지 않습니다:',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }
    throw new DashboardApiError(
      '상품 목록 응답 형식이 API 계약과 일치하지 않습니다.',
      { status: null }
    );
  }

  return result.data;
}

// backend/app/schemas/common.py::ProductCreate 계약 중 이 폼이 실제로
// 다루는 필드만 검증한다. image_url/stock_baseline_pct는 이 폼이 다루지
// 않는 필드라 요청 스키마에도 넣지 않는다 — products-data.js의
// buildProductCreatePayload가 애초에 그 키를 만들지 않으므로, 여기서
// 추가 필드를 허용하지 않아도(strict 아님, 단순 미정의) 문제없다. price는
// 이 화면 범위에서 0 이상의 정수만 허용한다(계약은 number를 허용하지만
// ProductRead/화면이 정수 금액을 쓰므로 UI 단에서 정수로 제한).
const productCreateRequestSchema = z.object({
  product_name: z.string().min(1).max(100),
  product_type: z.enum(['BREAD', 'DRINK']),
  category: z.string().nullable(),
  price: z.number().int().nonnegative(),
  source_type: z.enum(['FACTORY', 'IN_STORE']),
  initial_qty: z.number().int().nonnegative(),
});

// backend/app/schemas/common.py::ProductUpdate 계약 중 이 폼이 실제로
// 다루는 필드만 검증한다. PATCH는 partial update 계약이라 initial_qty/
// stock_baseline_pct/image_url/is_active는 절대 포함하지 않는다 — 그래야
// 서버가 보내지 않은 필드의 기존 값을 그대로 보존한다.
const productUpdateRequestSchema = z.object({
  product_name: z.string().min(1).max(100),
  product_type: z.enum(['BREAD', 'DRINK']),
  category: z.string().nullable(),
  price: z.number().int().nonnegative(),
  source_type: z.enum(['FACTORY', 'IN_STORE']),
});

// POST/PATCH 응답(둘 다 ProductRead) 공통 검증. 원본 응답이나 Zod issue
// 전체는 노출하지 않고, 경로가 계약과 어긋난 필드만 콘솔에 요약한다.
function parseProductReadResponse(raw, context) {
  const result = productReadSchema.safeParse(raw);
  if (!result.success) {
    if (typeof console !== 'undefined') {
      console.error(
        `[products-api] ${context} 응답이 계약과 일치하지 않습니다:`,
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }
    throw new DashboardApiError(
      '상품 응답 형식이 API 계약과 일치하지 않습니다.',
      { status: null }
    );
  }
  return result.data;
}

/**
 * POST /api/products. payload는 products-data.js의
 * buildProductCreatePayload가 만든 검증된 snake_case 객체여야 한다 —
 * 이 함수는 그 값을 다시 한번 Zod로 검증한 뒤에만 요청을 보낸다.
 * useMutation은 mutationFn에 signal을 자동으로 주지 않으므로, 이 함수는
 * signal을 받되 임의로 만들어내지 않는다(호출부가 넘기지 않으면 그냥
 * 없이 요청한다).
 */
export async function createProduct(payload, { signal } = {}) {
  const parsedRequest = productCreateRequestSchema.safeParse(payload);
  if (!parsedRequest.success) {
    throw new DashboardApiError('상품 등록 요청 값이 올바르지 않습니다.', {
      status: null,
    });
  }

  const raw = await requestDashboardJson('/products', {
    method: 'POST',
    body: JSON.stringify(parsedRequest.data),
    signal,
  });

  return parseProductReadResponse(raw, '상품 등록');
}

/**
 * PATCH /api/products/{productId}. payload는 products-data.js의
 * buildProductUpdatePayload가 만든 검증된 snake_case 객체여야 한다.
 */
export async function updateProduct(productId, payload, { signal } = {}) {
  const parsedProductId = Number(productId);
  if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
    throw new DashboardApiError('상품 식별자가 올바르지 않습니다.', {
      status: null,
    });
  }

  const parsedRequest = productUpdateRequestSchema.safeParse(payload);
  if (!parsedRequest.success) {
    throw new DashboardApiError('상품 수정 요청 값이 올바르지 않습니다.', {
      status: null,
    });
  }

  const raw = await requestDashboardJson(`/products/${parsedProductId}`, {
    method: 'PATCH',
    body: JSON.stringify(parsedRequest.data),
    signal,
  });

  return parseProductReadResponse(raw, '상품 수정');
}
