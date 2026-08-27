// Dashboard 재고 관리(S-11) 전용 실제 API 연결.
//
// GET /api/inventory의 query key, 요청 함수, 응답 Zod 스키마를 담는다.
// 화면 view model 매핑(페이지 메타, 긴급 보충 조합)은 이 파일이 아니라
// ../inventory-data.js가 담당한다 — 이 파일은 "실제 네트워크 요청 + 계약
// 검증"까지만 책임진다.
import { z } from 'zod';
import { requestDashboardJson, DashboardApiError } from './dashboard-api';
import { buildInventoryApiQuery } from '../inventory/inventory-data';

// query key namespace: ['dashboard', 'inventory', ...]
export const inventoryQueryKeys = {
  all: ['dashboard', 'inventory'],
  list: (normalizedQuery) => [
    'dashboard',
    'inventory',
    'list',
    normalizedQuery,
  ],
  urgentRestockBread: ['dashboard', 'inventory', 'urgent-restock', 'BREAD'],
};

// backend/app/schemas/inventory.py::InventoryListItem 계약. category/
// image_url은 OpenAPI required 목록에 없지만(서버 기본값 None) 항상 키
// 자체는 내려오고 값만 null일 수 있다 — optional이 아니라 nullable로
// 다룬다. initial_qty는 실제 API에 없으므로 스키마에 두지 않는다.
const inventoryListItemSchema = z.object({
  product_id: z.number().int(),
  product_name: z.string(),
  product_type: z.enum(['BREAD', 'DRINK']),
  category: z.string().nullable(),
  image_url: z.string().nullable(),
  produced_qty: z.number().int(),
  sold_qty: z.number().int(),
  remaining_qty: z.number().int(),
  remaining_pct: z.number(),
  stock_baseline_pct: z.number().int(),
  stock_status: z.enum(['OK', 'LOW', 'OUT']),
  updated_at: z.string().datetime({ offset: true }),
});

// backend/app/schemas/inventory.py::InventoryListResponse 계약.
const inventoryListResponseSchema = z.object({
  items: z.array(inventoryListItemSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  updated_at: z.string().datetime({ offset: true }),
});

// GET /api/inventory 실제 요청 + Zod 검증 공통 로직. fetchInventoryList와
// fetchUrgentRestockBread(OUT/LOW 두 요청) 모두 이 함수 하나를 재사용한다.
async function requestInventoryList(params, { signal } = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    search.set(key, String(value));
  });

  const raw = await requestDashboardJson(`/inventory?${search}`, { signal });

  const result = inventoryListResponseSchema.safeParse(raw);
  if (!result.success) {
    // 원본 응답이나 Zod issue 전체는 화면에 노출하지 않는다. 어떤 필드
    // 경로가 계약과 어긋났는지는 개발자 콘솔에만 요약(path + message)해
    // 남긴다.
    if (typeof console !== 'undefined') {
      console.error(
        '[inventory-api] 재고 목록 응답이 계약과 일치하지 않습니다:',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }
    throw new DashboardApiError(
      '재고 목록 응답 형식이 API 계약과 일치하지 않습니다.',
      { status: null }
    );
  }

  return result.data;
}

/**
 * 화면 조회 상태(queryState)를 buildInventoryApiQuery로 변환해 실제
 * GET /api/inventory를 호출한다. React Query가 전달한 signal은 그대로
 * requestDashboardJson → apiFetch까지 전달된다.
 */
export async function fetchInventoryList(queryState, { signal } = {}) {
  const params = buildInventoryApiQuery(queryState);
  return requestInventoryList(params, { signal });
}

/**
 * "지금 채워야 할 빵" 긴급 보충 영역 전용 조회. product_type=BREAD +
 * status=OUT / status=LOW 두 요청을 동일한 signal로 병렬 실행한다 —
 * 전체 BREAD를 큰 limit으로 한 번에 받아오는 방식은 쓰지 않는다(매장
 * 카탈로그 규모에 의존하지 않기 위함). 최종 UI 조합(OUT 먼저, 남는
 * 자리에 LOW, total 합산)은 inventory-data.js의 순수 mapper가 담당한다.
 */
export async function fetchUrgentRestockBread({ signal } = {}) {
  const [out, low] = await Promise.all([
    requestInventoryList(
      { product_type: 'BREAD', status: 'OUT', limit: 5, offset: 0 },
      { signal }
    ),
    requestInventoryList(
      { product_type: 'BREAD', status: 'LOW', limit: 5, offset: 0 },
      { signal }
    ),
  ]);

  return { out, low };
}

// backend/app/schemas/inventory.py::RestockRequest 계약(qty 하나뿐, 조정
// 사유 없음 — 확정된 결정이라 다시 추가하지 않는다). productId는 URL path
// 값이라 OpenAPI request body 스키마에는 없지만, 잘못된 값으로 PATCH를
// 만들지 않도록 이 함수 안에서 함께 검증한다.
const restockRequestSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().min(1).max(999),
});

// backend/app/schemas/inventory.py::RestockResponse 계약. remaining_pct/
// product_name/updated_at은 이 응답에 없으므로 스키마에도 두지 않는다 —
// 캐시를 이 응답만으로 직접 patch하지 않고 목록을 다시 조회해야 하는
// 이유이기도 하다.
const restockResponseSchema = z.object({
  product_id: z.number().int(),
  produced_qty: z.number().int(),
  remaining_qty: z.number().int(),
  stock_status: z.enum(['OK', 'LOW', 'OUT']),
});

/**
 * PATCH /api/inventory/{productId}/restock. requestDashboardJson을
 * 재사용하고, Authorization은 별도로 만들지 않는다(apiFetch/AUTH_DISABLED
 * 정책을 그대로 따름). React Query mutation은 signal을 자동으로 주지
 * 않으므로 이 함수는 signal을 받지도, 임의로 만들지도 않는다.
 */
export async function restockInventoryProduct({ productId, qty }) {
  const parsedRequest = restockRequestSchema.safeParse({ productId, qty });
  if (!parsedRequest.success) {
    throw new DashboardApiError('재고 반영 요청 값이 올바르지 않습니다.', {
      status: null,
    });
  }

  const raw = await requestDashboardJson(
    `/inventory/${parsedRequest.data.productId}/restock`,
    {
      method: 'PATCH',
      body: JSON.stringify({ qty: parsedRequest.data.qty }),
    }
  );

  const result = restockResponseSchema.safeParse(raw);
  if (!result.success) {
    // 원본 응답이나 Zod issue 전체는 화면에 노출하지 않는다. 어떤 필드
    // 경로가 계약과 어긋났는지는 개발자 콘솔에만 요약(path + message)해
    // 남긴다 — 응답 값 자체는 기록하지 않는다.
    if (typeof console !== 'undefined') {
      console.error(
        '[inventory-api] 재고 반영 응답이 계약과 일치하지 않습니다:',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }
    throw new DashboardApiError(
      '재고 반영 응답 형식이 API 계약과 일치하지 않습니다.',
      { status: null }
    );
  }

  return result.data;
}
