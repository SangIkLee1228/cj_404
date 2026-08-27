// Dashboard 판매 내역(S-07) 전용 실제 API 연결.
//
// GET /api/orders(목록)·GET /api/orders/{id}(상세)의 query key, 요청 함수,
// 응답 Zod 스키마를 담는다. 화면 view model 매핑(페이지 메타)은 이
// 파일이 아니라 ../sales/sales-data.js가 담당한다 — 이 파일은 "실제
// 네트워크 요청 + 계약 검증"까지만 책임진다.
import { z } from 'zod';
import { requestDashboardJson, DashboardApiError } from './dashboard-api';
import { buildSalesOrdersApiQuery } from '../sales/sales-data';

// query key namespace: ['dashboard', 'sales', ...]. list와 detail을
// 완전히 분리해 목록 query와 상세 query가 서로 무효화·재조회에 영향을
// 주지 않게 한다.
export const salesQueryKeys = {
  all: ['dashboard', 'sales'],
  lists: () => ['dashboard', 'sales', 'list'],
  list: (normalizedQuery) => ['dashboard', 'sales', 'list', normalizedQuery],
  details: () => ['dashboard', 'sales', 'detail'],
  detail: (orderId) => ['dashboard', 'sales', 'detail', orderId],
};

// backend/app/schemas/orders.py::OrderSummary 계약. 조회 기간 전체 기준
// 집계(페이지 기준 아님) — 세 필드 모두 required, nonnegative integer.
const orderSummarySchema = z.object({
  sales_amount: z.number().int().nonnegative(),
  order_count: z.number().int().nonnegative(),
  item_qty: z.number().int().nonnegative(),
});

// backend/app/schemas/orders.py::OrderListItem 계약. 목록 item에는
// status/payment_method/member/items가 없다(상세 전용 필드) — 여기 스키마
// 에도 추가하지 않는다. paid_at만 nullable(주문 미결제 상태로 목록에
// 잡히는 경우는 status=PAID 필터상 없지만, OpenAPI 계약 자체가 nullable
// 이라 그대로 반영한다).
const orderListItemSchema = z.object({
  order_id: z.number().int(),
  ordered_at: z.string().datetime({ offset: true }),
  paid_at: z.string().datetime({ offset: true }).nullable(),
  item_count: z.number().int().nonnegative(),
  item_summary: z.string(),
  gross_amount: z.number().int().nonnegative(),
  discount_amount: z.number().int().nonnegative(),
  total_amount: z.number().int().nonnegative(),
  member_applied: z.boolean(),
  point_earned: z.number().int().nonnegative(),
});

// backend/app/schemas/orders.py::OrderListResponse 계약. timezone은
// OpenAPI required 목록에 없는 default("Asia/Seoul") 필드라 optional로
// 다룬다(항상 키는 내려오지만 계약을 임의로 강화하지 않는다).
const orderListResponseSchema = z.object({
  items: z.array(orderListItemSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  timezone: z.string().optional(),
  summary: orderSummarySchema,
});

/**
 * 화면 조회 상태(queryState)를 buildSalesOrdersApiQuery로 변환해 실제
 * GET /api/orders를 호출한다. React Query가 전달한 signal은 그대로
 * requestDashboardJson → apiFetch까지 전달된다.
 */
export async function fetchSalesOrders(queryState, { signal } = {}) {
  const params = buildSalesOrdersApiQuery(queryState);
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    search.set(key, String(value));
  });

  const raw = await requestDashboardJson(`/orders?${search}`, { signal });

  const result = orderListResponseSchema.safeParse(raw);
  if (!result.success) {
    // 원본 응답이나 Zod issue 전체(회원 정보 포함 가능성)는 화면에
    // 노출하지 않는다. 어떤 필드 경로가 계약과 어긋났는지는 개발자
    // 콘솔에만 요약(path + message)해 남긴다 — 응답 값 자체는 기록하지
    // 않는다.
    if (typeof console !== 'undefined') {
      console.error(
        '[sales-api] 판매 목록 응답이 계약과 일치하지 않습니다:',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }
    throw new DashboardApiError(
      '판매 목록 응답 형식이 API 계약과 일치하지 않습니다.',
      { status: null }
    );
  }

  return result.data;
}

// backend/app/schemas/orders.py::OrderMemberSummary 계약. name은 서버가
// 항상 마스킹해 내려주는 문자열이다(원본 노출 없음) — 이 값을 콘솔에
// 출력하지 않는다. grade_code만 nullable.
const orderMemberSummarySchema = z.object({
  member_id: z.number().int(),
  name: z.string(),
  grade_code: z.enum(['FRIENDS', 'FAMILY', 'MANIA', 'VIP']).nullable(),
});

// backend/app/schemas/orders.py::OrderItemRead 계약. product_name은
// required 목록에 없는 nullable 필드(상품이 카탈로그에서 사라진 경우
// 등)다. needs_review는 OpenAPI default(false)를 그대로 반영한다.
const orderItemReadSchema = z.object({
  order_item_id: z.number().int(),
  product_id: z.number().int(),
  product_name: z.string().nullable(),
  quantity: z.number().int().positive(),
  unit_price: z.number().int().nonnegative(),
  subtotal: z.number().int().nonnegative(),
  source_type: z.enum(['AI_DETECTED', 'STAFF_CORRECTED', 'MANUAL_ADD']),
  needs_review: z.boolean().default(false),
});

// backend/app/schemas/orders.py::OrderDetail 계약. paid_at/payment_method/
// member는 전부 nullable(PENDING/CANCELLED 주문에서 실제로 null로
// 관측됨). correction_count는 OpenAPI default(0)를 그대로 반영한다.
// member_applied/item_count/item_summary/timezone은 상세 응답에 없는
// 필드라 여기 스키마에도 추가하지 않는다.
const orderDetailSchema = z.object({
  order_id: z.number().int(),
  status: z.enum(['PENDING', 'PAYING', 'PAID', 'CANCELLED']),
  ordered_at: z.string().datetime({ offset: true }),
  paid_at: z.string().datetime({ offset: true }).nullable(),
  payment_method: z.enum(['CARD', 'EASY_PAY', 'POINT']).nullable(),
  gross_amount: z.number().int().nonnegative(),
  membership_discount_amount: z.number().int().nonnegative(),
  manual_discount_amount: z.number().int().nonnegative(),
  discount_amount: z.number().int().nonnegative(),
  total_amount: z.number().int().nonnegative(),
  member: orderMemberSummarySchema.nullable(),
  point_earned: z.number().int().nonnegative(),
  point_used: z.number().int().nonnegative(),
  correction_count: z.number().int().nonnegative().default(0),
  items: z.array(orderItemReadSchema),
});

/**
 * GET /api/orders/{orderId}. orderId는 양의 정수만 허용한다. React
 * Query가 전달한 signal은 그대로 requestDashboardJson → apiFetch까지
 * 전달된다.
 */
export async function fetchSalesOrderDetail(orderId, { signal } = {}) {
  const parsedOrderId = Number(orderId);
  if (!Number.isInteger(parsedOrderId) || parsedOrderId <= 0) {
    throw new DashboardApiError('주문 식별자가 올바르지 않습니다.', {
      status: null,
    });
  }

  const raw = await requestDashboardJson(`/orders/${parsedOrderId}`, {
    signal,
  });

  const result = orderDetailSchema.safeParse(raw);
  if (!result.success) {
    // 원본 응답·회원 정보(이름 등)·Zod issue 전체는 화면이나 콘솔에
    // 노출하지 않는다. 어떤 필드 경로가 계약과 어긋났는지만 요약
    // (path + message)해 콘솔에 남긴다.
    if (typeof console !== 'undefined') {
      console.error(
        '[sales-api] 판매 상세 응답이 계약과 일치하지 않습니다:',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }
    throw new DashboardApiError(
      '판매 상세 응답 형식이 API 계약과 일치하지 않습니다.',
      { status: null }
    );
  }

  return result.data;
}
