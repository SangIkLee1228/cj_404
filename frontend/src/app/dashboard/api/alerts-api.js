// Dashboard 재고 알림(S-12) 전용 실제 API 연결.
//
// GET /api/notifications(목록)·GET /api/notifications/unread-count·
// PATCH /api/notifications/{id}/read·PATCH /api/notifications/read-all의
// query key, 요청 함수, 응답 Zod 스키마를 담는다. 화면 view model 매핑
// (페이지 메타)은 이 파일이 아니라 ../alerts/alerts-data.js가 담당한다 —
// 이 파일은 "실제 네트워크 요청 + 계약 검증"까지만 책임진다.
import { z } from 'zod';
import { requestDashboardJson, DashboardApiError } from './dashboard-api';
import { buildNotificationsApiQuery } from '../alerts/alerts-data';

// query key namespace: ['dashboard', 'alerts', ...]
export const alertsQueryKeys = {
  all: ['dashboard', 'alerts'],
  lists: () => ['dashboard', 'alerts', 'list'],
  list: (normalizedQuery) => ['dashboard', 'alerts', 'list', normalizedQuery],
};

// backend/app/api/routes/notifications.py::NotificationListItem 계약.
// required: notification_id/notif_type/title/message/severity/is_read/
// created_at. related_product_id/product_name/remaining_qty_snapshot은
// OpenAPI required 목록에 없고 Pydantic 기본값이 null인 필드다 — 키 자체가
// 응답에서 생략되어도(undefined) 파싱 결과는 항상 null 또는 실제 값이
// 되도록 `.nullable().default(null)`을 쓴다. `.optional()`만 쓰면 downstream
// (alerts-data.js/AlertsPageContent.jsx)에 undefined가 전달될 수 있어 쓰지
// 않는다.
const notificationListItemSchema = z.object({
  notification_id: z.number().int(),
  notif_type: z.enum(['STOCK_LOW', 'SYSTEM']),
  related_product_id: z.number().int().nullable().default(null),
  product_name: z.string().nullable().default(null),
  title: z.string(),
  message: z.string(),
  remaining_qty_snapshot: z.number().int().nullable().default(null),
  severity: z.enum(['OUT', 'LOW', 'INFO']),
  is_read: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
});

// backend NotificationSummary 계약. 매장 전체 기준 카운트 — 필터에 따라
// 값이 바뀌지 않는다는 계약이지만, 이 스키마는 shape 검증만 한다(값
// 불변 확인은 화면 쪽 책임이 아니라 별도 검증 스크립트에서 다룬다).
const notificationSummarySchema = z.object({
  out_count: z.number().int().nonnegative(),
  low_count: z.number().int().nonnegative(),
  unread_count: z.number().int().nonnegative(),
});

// backend NotificationListResponse 계약. 전부 required.
const notificationListResponseSchema = z.object({
  items: z.array(notificationListItemSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  unread_count: z.number().int().nonnegative(),
  summary: notificationSummarySchema,
  updated_at: z.string().datetime({ offset: true }),
});

// backend ReadAllResponse 계약.
const readAllResponseSchema = z.object({
  updated_count: z.number().int().nonnegative(),
});

/**
 * 화면 조회 상태(queryState)를 buildNotificationsApiQuery로 변환해 실제
 * GET /api/notifications를 호출한다. React Query가 전달한 signal은 그대로
 * requestDashboardJson → apiFetch까지 전달된다.
 */
export async function fetchNotifications(queryState, { signal } = {}) {
  const params = buildNotificationsApiQuery(queryState);
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    search.set(key, String(value));
  });

  const raw = await requestDashboardJson(`/notifications?${search}`, {
    signal,
  });

  const result = notificationListResponseSchema.safeParse(raw);
  if (!result.success) {
    // 원본 응답이나 Zod issue 전체는 화면에 노출하지 않는다. 어떤 필드
    // 경로가 계약과 어긋났는지는 개발자 콘솔에만 요약(path + message)해
    // 남긴다 — 응답 값 자체는 기록하지 않는다.
    if (typeof console !== 'undefined') {
      console.error(
        '[alerts-api] 알림 목록 응답이 계약과 일치하지 않습니다:',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }
    throw new DashboardApiError(
      '알림 목록 응답 형식이 API 계약과 일치하지 않습니다.',
      { status: null }
    );
  }

  return result.data;
}

/**
 * PATCH /api/notifications/{id}/read. body 없이 호출한다. notificationId는
 * 양의 정수만 허용한다. useMutation의 mutationFn은 signal을 자동으로
 * 넘기지 않으므로, 이 함수는 signal을 받되 호출부가 넘기지 않으면 그냥
 * 없이 요청한다.
 */
export async function markNotificationRead(notificationId, { signal } = {}) {
  const parsedId = Number(notificationId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new DashboardApiError('알림 식별자가 올바르지 않습니다.', {
      status: null,
    });
  }

  const raw = await requestDashboardJson(`/notifications/${parsedId}/read`, {
    method: 'PATCH',
    signal,
  });

  const result = notificationListItemSchema.safeParse(raw);
  if (!result.success) {
    if (typeof console !== 'undefined') {
      console.error(
        '[alerts-api] 알림 읽음 처리 응답이 계약과 일치하지 않습니다:',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }
    throw new DashboardApiError(
      '알림 읽음 처리 응답 형식이 API 계약과 일치하지 않습니다.',
      { status: null }
    );
  }

  return result.data;
}

/**
 * PATCH /api/notifications/read-all. body 없이 호출한다.
 */
export async function markAllNotificationsRead({ signal } = {}) {
  const raw = await requestDashboardJson('/notifications/read-all', {
    method: 'PATCH',
    signal,
  });

  const result = readAllResponseSchema.safeParse(raw);
  if (!result.success) {
    if (typeof console !== 'undefined') {
      console.error(
        '[alerts-api] 전체 읽음 처리 응답이 계약과 일치하지 않습니다:',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }
    throw new DashboardApiError(
      '전체 읽음 처리 응답 형식이 API 계약과 일치하지 않습니다.',
      { status: null }
    );
  }

  return result.data;
}
