// Dashboard 운영 현황(홈, OV-1) 전용 실제 API 연결.
//
// GET /api/dashboard/overview의 query key, 요청 함수, 응답 Zod 스키마를
// 담는다. Overview 화면 전용 view model 매핑은 이 파일이 아니라
// ../overview-data.js가 담당한다 — 이 파일은 "실제 네트워크 요청 + 계약
// 검증"까지만 책임진다.
import { z } from 'zod';
import { requestDashboardJson, DashboardApiError } from './dashboard-api';
import { buildDashboardOverviewApiQuery } from '../overview-data';

// query key namespace: ['dashboard', 'overview', ...]
export const overviewQueryKeys = {
  all: ['dashboard', 'overview'],
  detail: (period) => ['dashboard', 'overview', period],
};

const periodSchema = z.enum(['TODAY', '7D', '30D']);

// backend/app/schemas/dashboard.py::DashboardKpi 계약(OpenAPI required:
// sales_amount/order_count/item_qty/low_stock_count, 나머지는 서버
// 기본값이 있는 optional 필드).
const dashboardKpiSchema = z.object({
  sales_amount: z.number().int(),
  order_count: z.number().int(),
  item_qty: z.number().int(),
  correction_rate: z.number().default(0),
  low_stock_count: z.number().int(),
  prev_sales_amount: z.number().int().default(0),
  prev_order_count: z.number().int().default(0),
  prev_item_qty: z.number().int().default(0),
  sales_change_pct: z.number().default(0),
  order_change_pct: z.number().default(0),
  item_change_pct: z.number().default(0),
});

// backend/app/schemas/dashboard.py::SalesChartPoint. order_count는 서버
// 기본값 0이 있는 optional 필드다.
const salesChartPointSchema = z.object({
  label: z.string(),
  amount: z.number().int(),
  order_count: z.number().int().default(0),
});

const salesChartSchema = z.object({
  unit: z.enum(['HOUR', 'DAY']),
  points: z.array(salesChartPointSchema),
});

// backend/app/schemas/dashboard.py::TopProduct. share_pct는 서버 기본값
// 0.0이 있는 optional 필드다.
const topProductSchema = z.object({
  product_id: z.number().int(),
  product_name: z.string(),
  sold_qty: z.number().int(),
  share_pct: z.number().default(0),
});

// backend/app/schemas/dashboard.py::TopProductsOthers.
const topProductsOthersSchema = z.object({
  product_count: z.number().int(),
  sold_qty: z.number().int(),
  share_pct: z.number().default(0),
});

// backend/app/schemas/dashboard.py::RecentOrder. 화면에 찍는 시각은
// paid_at(결제 시각)이고 ordered_at은 계약 호환을 위해 함께 내려오는 값이다.
// paid_at은 서버 기본값 null이 있는 optional 필드라 nullable+optional로 둔다.
const recentOrderSchema = z.object({
  order_id: z.number().int(),
  ordered_at: z.string().datetime({ offset: true }),
  paid_at: z.string().datetime({ offset: true }).nullable().default(null),
  item_summary: z.string(),
  item_count: z.number().int(),
  total_amount: z.number().int(),
});

const lowStockItemSchema = z.object({
  product_id: z.number().int(),
  product_name: z.string(),
  remaining_qty: z.number().int(),
  produced_qty: z.number().int(),
  stock_baseline_pct: z.number().int(),
});

// backend/app/schemas/dashboard.py::DashboardOverviewResponse. timezone은
// 서버 기본값 "Asia/Seoul"이 있는 optional 필드고, 나머지 최상위 필드는
// OpenAPI required 목록과 동일하다.
const dashboardOverviewResponseSchema = z.object({
  period: periodSchema,
  timezone: z.string().default('Asia/Seoul'),
  kpi: dashboardKpiSchema,
  sales_chart: salesChartSchema,
  top_products: z.array(topProductSchema),
  top_products_others: topProductsOthersSchema,
  recent_orders: z.array(recentOrderSchema),
  low_stock: z.array(lowStockItemSchema),
  updated_at: z.string().datetime({ offset: true }),
});

/**
 * GET /api/dashboard/overview?period=... 실제 응답을 조회하고 Zod로
 * 검증한 뒤 반환한다. React Query가 전달한 signal은 requestDashboardJson을
 * 거쳐 apiFetch까지 그대로 전달된다(취소 시 AbortError가 그대로
 * propagate된다 — requestDashboardJson이 이를 DashboardApiError로 바꾸지
 * 않는다).
 */
export async function fetchDashboardOverview(queryState, { signal } = {}) {
  const { period } = buildDashboardOverviewApiQuery(queryState);
  const params = new URLSearchParams({ period });

  const raw = await requestDashboardJson(`/dashboard/overview?${params}`, {
    signal,
  });

  const result = dashboardOverviewResponseSchema.safeParse(raw);
  if (!result.success) {
    // 원본 응답이나 Zod issue 전체는 화면에 노출하지 않는다. 어떤 필드
    // 경로가 계약과 어긋났는지는 개발자 콘솔에만 요약(path + message)해
    // 남긴다.
    if (typeof console !== 'undefined') {
      console.error(
        '[overview-api] 운영 현황 응답이 계약과 일치하지 않습니다:',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }
    throw new DashboardApiError(
      '운영 현황 응답 형식이 API 계약과 일치하지 않습니다.',
      { status: null }
    );
  }

  return result.data;
}
