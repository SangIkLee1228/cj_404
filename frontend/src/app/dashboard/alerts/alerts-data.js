// Dashboard 알림(S-12) 화면이 쓸 순수 데이터·UI 상수.
//
// React/브라우저 API에 의존하지 않는다. 입력·출력 item은 실제 GET
// /api/notifications 응답과 동일한 snake_case 구조를 그대로 사용하며,
// camelCase로 복제·변환하지 않는다. 실제 요청·Zod 검증은
// api/alerts-api.js가 담당한다.
//
// 이 파일이 제공하는 역할은 다음과 같다.
//
//   1) buildNotificationsApiQuery       — 화면 조회 상태 → 실제
//                                          GET /api/notifications 요청
//                                          파라미터
//   2) mapNotificationsResponseToPageInfo — 목록 응답 → 화면 표시용 페이지
//                                          메타 정보(summary 포함)
//   3) getNotificationSeverityMeta      — severity → 화면 표시 메타
//                                          (라벨/배지 상태/아이콘 이름)
//   4) formatNotificationDateTime       — Asia/Seoul 기준 생성 시각 포맷
//   5) ALERTS_PAGE_SIZE/READ_STATUS_FILTER_OPTIONS/
//      NOTIFICATION_SEVERITY_FILTER_OPTIONS — 필터 UI 상수
//      (alerts-mock-data.js에 동일한 이름의 export가 남아 있지만,
//      production runtime은 이제 이 파일의 정의만 쓴다)

// 알림 목록의 페이지당 노출 개수(UI 정책) = 실제 API 요청의 limit 값.
export const ALERTS_PAGE_SIZE = 12;

// 읽음 상태 필터 선택 항목(SegmentedControl용).
export const READ_STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'UNREAD', label: '안 읽음' },
];

// 알림 수준(severity) 필터 선택 항목(SegmentedControl용). 실제
// GET /api/notifications의 severity 쿼리 파라미터가 받는 값(OUT/LOW/INFO)과
// 'ALL'(필터 전용, 실제 API 값 아님)로 구성한다.
export const NOTIFICATION_SEVERITY_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'OUT', label: '매진' },
  { value: 'LOW', label: '재고 부족' },
  { value: 'INFO', label: '시스템' },
];

// 화면 조회 상태의 기본값. 화면이 실수로 이 객체를 직접 mutate해 다른 화면
// 상태와 뒤섞이는 일이 없도록 freeze한다.
export const DEFAULT_ALERTS_QUERY = Object.freeze({
  readStatus: 'ALL',
  severity: 'ALL',
  page: 1,
});

// page 값을 1 이상의 정수로 보정한다 — buildNotificationsApiQuery의 내부
// helper라 export하지 않는다.
function resolveQueryPage(page) {
  const numericPage = Number(page);
  return Number.isFinite(numericPage)
    ? Math.max(1, Math.trunc(numericPage))
    : 1;
}

// 화면 조회 상태를 실제 GET /api/notifications 요청 파라미터로 변환한다.
// URLSearchParams에 바로 넘길 수 있는 단순한 { key: string | number | boolean }
// 구조를 반환할 뿐, 실제 URL 조립이나 fetch 호출은 하지 않는다.
export function buildNotificationsApiQuery(queryState = DEFAULT_ALERTS_QUERY) {
  const resolved = { ...DEFAULT_ALERTS_QUERY, ...queryState };
  const page = resolveQueryPage(resolved.page);
  const limit = ALERTS_PAGE_SIZE;
  const offset = (page - 1) * limit;

  const query = { limit, offset };
  if (resolved.readStatus === 'UNREAD') {
    query.is_read = false;
  }
  if (resolved.severity !== 'ALL') {
    query.severity = resolved.severity;
  }
  return query;
}

// 실제 GET /api/notifications 응답을 화면 표시용 페이지 메타 정보로
// 변환한다. response.items를 그대로 쓸 뿐 다시 filter/sort/slice하지
// 않는다 — 필터·정렬·페이지 분할은 이미 조회 단계(실제 API)에서 끝난
// 일이라는 전제다. response를 mutate하지 않는다.
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
  const summary = response?.summary ?? null;
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
      summary,
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
    summary,
    updatedAt,
  };
}

// severity → 화면 표시 메타. 이 파일은 React/아이콘 컴포넌트를 다루지
// 않으므로(순수 데이터 파일), 실제 아이콘 컴포넌트가 아니라 아이콘 이름
// 문자열만 돌려준다 — AlertsPageContent.jsx가 이 이름을 lucide-react
// 컴포넌트로 매핑해 렌더링한다. backend가 이미 판정한 severity 값을 그대로
// 표시할 뿐, 프론트에서 severity를 다시 계산하지 않는다.
//
// OUT/LOW는 StatusBadge(status="out"/"low")로 표시해 매진과 재고 부족을
// 색으로도 구분한다(dashboard.md의 매진 임박/매진 표현 규칙). INFO는
// Success/Warning/Out 배지를 억지로 쓰지 않고 중립 표현을 쓴다.
const NOTIFICATION_SEVERITY_META = {
  OUT: {
    label: '매진',
    badgeStatus: 'out',
    iconName: 'AlertTriangle',
    iconTone: 'out',
  },
  LOW: {
    label: '재고 부족',
    badgeStatus: 'low',
    iconName: 'AlertTriangle',
    iconTone: 'warning',
  },
  INFO: {
    label: '시스템',
    badgeStatus: null,
    iconName: 'Info',
    iconTone: 'info',
  },
};

// 저장소에서 현재 확인되지 않는 severity가 응답에 섞여 와도 화면이
// 깨지지 않도록 중립 fallback을 둔다. 필터 옵션에는 추가하지 않는다.
const UNKNOWN_NOTIFICATION_SEVERITY_META = {
  label: '알림',
  badgeStatus: null,
  iconName: 'Bell',
  iconTone: 'neutral',
};

export function getNotificationSeverityMeta(severity) {
  return (
    NOTIFICATION_SEVERITY_META[severity] ?? UNKNOWN_NOTIFICATION_SEVERITY_META
  );
}

// 알림 생성 시각을 표시한다. ISO 문자열을 slice하지 않고, 명시적
// timeZone('Asia/Seoul')과 명시적 locale('ko-KR')로 Intl.DateTimeFormat을
// 사용해 브라우저 기본 timezone/locale에 의존하지 않는다 — 서버(SSR)와
// 클라이언트가 항상 같은 문자열을 만들어야 hydration 불일치가 나지
// 않는다. formatToParts로 직접 조립해 "YYYY-MM-DD HH:MM" 형식을 고정한다
// (로케일 기본 구두점에 기대지 않음).
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
