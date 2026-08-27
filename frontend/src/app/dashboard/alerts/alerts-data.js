// Dashboard 알림(S-12) 화면이 쓸 순수 데이터 파생 로직.
//
// React/브라우저 API에 의존하지 않는다. 실제 GET /api/notifications 응답과
// 필드를 맞췄지만, 여전히 Mock이며 fetch는 하지 않는다. 이 파일이 제공하는
// 역할은 다음과 같다.
//
//   1) buildNotificationsApiQuery       — 화면 조회 상태 → 실제
//                                          GET /api/notifications 요청
//                                          파라미터
//   2) queryMockNotifications           — (API 연결 전 임시) Mock 알림을
//                                          필터·페이지 단위로 조회
//   3) mapNotificationsResponseToPageInfo — 목록 응답 → 화면 표시용 페이지
//                                          메타 정보
//   4) getNotificationTypeMeta          — notif_type → 화면 표시 메타
//                                          (라벨/의미/아이콘 이름)
//   5) formatNotificationDateTime       — Asia/Seoul 기준 생성 시각 포맷
import { ALERTS_PAGE_SIZE } from './alerts-mock-data';

// 화면 조회 상태의 기본값. 화면이 실수로 이 객체를 직접 mutate해 다른 화면
// 상태와 뒤섞이는 일이 없도록 freeze한다.
export const DEFAULT_ALERTS_QUERY = Object.freeze({
  readStatus: 'ALL',
  notificationType: 'ALL',
  page: 1,
});

// page 값을 1 이상의 정수로 보정한다 — buildNotificationsApiQuery와
// queryMockNotifications가 동일한 보정 규칙을 공유하기 위한 내부 helper라
// export하지 않는다.
function resolveQueryPage(page) {
  const numericPage = Number(page);
  return Number.isFinite(numericPage)
    ? Math.max(1, Math.trunc(numericPage))
    : 1;
}

// 화면 조회 상태를 실제 GET /api/notifications 요청 파라미터로 변환한다.
// 현재 저장소의 실제 라우트(backend/app/api/routes/notifications.py)가
// 지원하는 파라미터는 is_read/limit/offset뿐이다 — notificationType(알림
// 유형) 필터는 이 화면의 Mock 전용 필터이고 실제 API에는 아직 대응하는
// notif_type 쿼리 파라미터가 없다. 사용자가 전달한 최신 명세에는 severity
// 필터도 언급되지만, 현재 라우트에는 severity 파라미터가 없어 포함하지
// 않는다. 실제 API 연결 전에 백엔드에 notif_type(및 필요 시 severity)
// 필터를 추가할지, 아니면 이 화면의 유형 필터를 클라이언트 사이드
// 필터링으로 유지할지 정책을 재검토해야 한다.
export function buildNotificationsApiQuery(queryState = DEFAULT_ALERTS_QUERY) {
  const resolved = { ...DEFAULT_ALERTS_QUERY, ...queryState };
  const page = resolveQueryPage(resolved.page);
  const limit = ALERTS_PAGE_SIZE;
  const offset = (page - 1) * limit;

  const query = { limit, offset };
  if (resolved.readStatus === 'UNREAD') {
    query.is_read = false;
  }
  return query;
}

function computeUnreadCount(items) {
  return items.reduce((count, item) => count + (item.is_read ? 0 : 1), 0);
}

function computeUpdatedAt(items) {
  if (items.length === 0) {
    return null;
  }
  return items.reduce(
    (latest, item) => (item.created_at > latest ? item.created_at : latest),
    items[0].created_at
  );
}

// API 연결 전 임시: Mock 알림을 필터·페이지 단위로 조회하는 순수 함수.
// items를 직접 mutate하지 않는다(filter/slice/reduce만 사용). 반환 shape은
// 실제 GET /api/notifications 응답과 동일하다 —
// { items, total, limit, offset, unread_count, updated_at }.
//
// unread_count/updated_at은 이 함수가 반환하는 페이지 items나 필터링된
// total이 아니라, 전달받은 매장 전체 Mock 알림(items 인자 전체) 기준으로
// 계산한다 — 실제 API의 unread_count도 "지금 보는 필터 결과"가 아니라
// "전체 미읽음 개수"를 뜻하는 계약이기 때문이다.
//
// 요청 page가 필터 결과의 마지막 페이지보다 크면(예: 개별 읽음 처리로
// UNREAD 필터 결과가 줄어든 경우) 이 함수가 유효한 마지막 페이지로
// 스스로 보정한다 — 화면은 별도로 page를 되돌리지 않아도 된다.
export function queryMockNotifications(
  items,
  queryState = DEFAULT_ALERTS_QUERY
) {
  const resolved = { ...DEFAULT_ALERTS_QUERY, ...queryState };

  const filtered = items.filter((item) => {
    if (resolved.readStatus === 'UNREAD' && item.is_read) {
      return false;
    }
    if (
      resolved.notificationType !== 'ALL' &&
      item.notif_type !== resolved.notificationType
    ) {
      return false;
    }
    return true;
  });

  const total = filtered.length;
  const limit = ALERTS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const requestedPage = resolveQueryPage(resolved.page);
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * limit;
  const pageItems = filtered.slice(offset, offset + limit);

  return {
    items: pageItems,
    total,
    limit,
    offset,
    unread_count: computeUnreadCount(items),
    updated_at: computeUpdatedAt(items),
  };
}

// 목록 응답(queryMockNotifications의 반환값, 또는 이후 실제 fetch 응답)을
// 화면 표시용 페이지 메타 정보로 변환한다. response.items를 그대로 쓸 뿐
// 다시 slice하지 않는다.
export function mapNotificationsResponseToPageInfo(response) {
  const items = response?.items ?? [];
  const total =
    Number.isInteger(response?.total) && response.total >= 0
      ? response.total
      : items.length;
  const limit =
    Number.isInteger(response?.limit) && response.limit > 0
      ? response.limit
      : ALERTS_PAGE_SIZE;
  const offset =
    Number.isInteger(response?.offset) && response.offset >= 0
      ? response.offset
      : 0;
  const unreadCount =
    Number.isInteger(response?.unread_count) && response.unread_count >= 0
      ? response.unread_count
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
      unreadCount,
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
    unreadCount,
    updatedAt,
  };
}

// notif_type → 화면 표시 메타. 이 파일은 React/아이콘 컴포넌트를 다루지
// 않으므로(순수 데이터 파일), 실제 아이콘 컴포넌트가 아니라 아이콘 이름
// 문자열만 돌려준다 — AlertsPageContent.jsx가 이 이름을 lucide-react
// 컴포넌트로 매핑해 렌더링한다.
//
// STOCK_LOW는 Warning 의미(기존 StatusBadge status="low" 재사용 가능),
// SYSTEM은 중립적인 Info 의미(Success/Warning/Out 배지를 억지로 쓰지
// 않고, 페이지 CSS의 중립 표현을 쓴다). remaining_qty_snapshot이 0이어도
// STOCK_OUT 같은 새 유형으로 바꾸지 않는다 — API가 이미 STOCK_LOW로
// 판정한 결과를 그대로 표시할 뿐이다.
const NOTIFICATION_TYPE_META = {
  STOCK_LOW: { label: '재고 알림', tone: 'warning', iconName: 'AlertTriangle' },
  SYSTEM: { label: '시스템', tone: 'info', iconName: 'Info' },
};

// 저장소에서 현재 확인되지 않는 notif_type이 응답에 섞여 와도 화면이
// 깨지지 않도록 중립 fallback을 둔다. 필터 옵션에는 추가하지 않는다.
const UNKNOWN_NOTIFICATION_TYPE_META = {
  label: '알림',
  tone: 'neutral',
  iconName: 'Bell',
};

export function getNotificationTypeMeta(notifType) {
  return NOTIFICATION_TYPE_META[notifType] ?? UNKNOWN_NOTIFICATION_TYPE_META;
}

// 알림 생성 시각을 표시한다. ISO 문자열을 slice하지 않고, 명시적
// timeZone('Asia/Seoul')과 명시적 locale('ko-KR')로 Intl.DateTimeFormat을
// 사용해 브라우저 기본 timezone/locale에 의존하지 않는다 — 서버(SSR)와
// 클라이언트가 항상 같은 문자열을 만들어야 hydration 불일치가 나지
// 않는다. formatToParts로 직접 조립해 "YYYY-MM-DD HH:MM" 형식을 고정한다
// (로케일 기본 구두점에 기대지 않음). 실제 GET /api/notifications 응답에는
// Sales 응답과 달리 별도의 timezone 필드가 없으므로 'Asia/Seoul'을
// 고정값으로 명시한다.
export function formatNotificationDateTime(isoString) {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
