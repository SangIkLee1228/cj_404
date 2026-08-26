// Dashboard 판매 내역(S-07) 화면이 쓸 순수 데이터 파생 로직.
//
// React/브라우저 API에 의존하지 않는다. 이 화면의 주 계약은 실제
// GET /api/orders(목록)·GET /api/orders/{id}(상세)다 — 아직 fetch는
// 구현하지 않고, sales-mock-data.js의 Mock으로 같은 shape을 흉내낸다.
// 이전 버전에서 쓰던 GET /api/stats/sales 전용 build 함수와 group_by
// 전제는 제거했다(판매 페이지가 그 엔드포인트를 쓰지 않으므로).
//
// Inventory/Products의 *-data.js와 같은 구조를 참고했지만 그 파일들을
// import하지 않는다. 이 파일이 제공하는 역할은 다음과 같다.
//
//   1) buildSalesOrdersApiQuery       — 화면 조회 상태 → 실제
//                                        GET /api/orders 요청 파라미터
//   2) queryMockSalesOrders           — (API 연결 전 임시) Mock 목록을
//                                        페이지 단위로 조회. summary는
//                                        페이지가 아니라 선택 기간 전체
//                                        기준으로 함께 반환한다.
//   3) queryMockSalesOrderDetail      — (API 연결 전 임시) order_id 기준
//                                        Mock 상세 단건 조회
//   4) mapSalesOrdersResponseToPageInfo — 목록 응답 → 화면 표시용 페이지
//                                        메타 정보(timezone/summary 포함)
//   5) getSalesPeriodLabel            — 기간 값 → 화면 표시용 긴 라벨
//   6) formatSalesDateTime            — timezone 기준 결제/주문 시각 포맷
//                                        (목록·상세 화면이 공유, ISO 문자열
//                                        slice 금지 요구사항 때문에 추가)
import {
  SALES_MOCK_ORDER_LIST_ITEMS,
  SALES_MOCK_ORDER_DETAILS,
  SALES_PAGE_SIZE,
  SALES_MOCK_REFERENCE_DATE,
  SALES_TIMEZONE,
} from './sales-mock-data';

// 화면 조회 상태의 기본값. 기간은 오늘, 1페이지부터 시작. 화면이 실수로 이
// 객체를 직접 mutate해 다른 화면 상태와 뒤섞이는 일이 없도록 freeze한다.
export const DEFAULT_SALES_QUERY = Object.freeze({
  period: 'TODAY',
  page: 1,
});

// page 값을 1 이상의 정수로 보정한다 — buildSalesOrdersApiQuery와
// queryMockSalesOrders가 동일한 보정 규칙을 공유하기 위한 내부 helper라
// export하지 않는다.
function resolveQueryPage(page) {
  const numericPage = Number(page);
  return Number.isFinite(numericPage)
    ? Math.max(1, Math.trunc(numericPage))
    : 1;
}

// 세 기간의 시작일. 지침이 고정 기준일(2026-08-26)에서 역산해 명시한 값
// 그대로다 — 이 값이 곧 계약이라 별도 날짜 연산 유틸을 두지 않았다.
const PERIOD_START_DATE = {
  TODAY: SALES_MOCK_REFERENCE_DATE,
  '7D': '2026-08-20',
  '30D': '2026-07-28',
};

const PERIOD_LABEL = {
  TODAY: '오늘',
  '7D': '최근 1주일',
  '30D': '최근 1개월',
};

// 기간 값을 화면 표시용 긴 라벨로 매핑만 한다(새 업무 규칙 없음).
export function getSalesPeriodLabel(period) {
  return PERIOD_LABEL[period] ?? PERIOD_LABEL.TODAY;
}

// order_id로 상세 Mock을 즉시 찾기 위한 조회용 Map. 모듈 로드 시 한 번만
// 만들고, 원본 배열(SALES_MOCK_ORDER_DETAILS)은 mutate하지 않는다.
const ORDER_DETAIL_BY_ID = new Map(
  SALES_MOCK_ORDER_DETAILS.map((detail) => [detail.order_id, detail])
);

// UTC(+00:00) ISO 문자열에서, 그 시각이 Asia/Seoul(연중 고정 UTC+9)
// 기준으로 속하는 달력 날짜('YYYY-MM-DD')를 구한다. 문자열 slice 대신
// 실제 UTC 오프셋을 더하는 계산이라 타임스탬프가 어떤 오프셋으로 와도
// KST 날짜를 정확히 구한다(현재는 항상 +00:00 고정이지만, slice와 달리
// 오프셋이 달라져도 깨지지 않는다).
function getKstDateKey(isoString) {
  const utcMs = Date.parse(isoString);
  const kstMs = utcMs + 9 * 60 * 60 * 1000;
  const kstDate = new Date(kstMs);
  const y = kstDate.getUTCFullYear();
  const m = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kstDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// SALES_MOCK_ORDER_LIST_ITEMS(이미 paid_at 최신순 정렬)에서 기간 범위에
// 드는 주문만 남긴다. filter는 살아남은 요소의 상대 순서를 바꾸지 않으므로
// 다시 정렬하지 않는다. Mock 데이터는 전부 PAID 상태로만 생성되므로 별도
// 상태 필터는 두지 않는다(목록 item에는 애초에 status 필드가 없다 — 실제
// 계약과 동일).
function filterOrdersByPeriod(period) {
  const startDate = PERIOD_START_DATE[period] ?? PERIOD_START_DATE.TODAY;
  const endDate = SALES_MOCK_REFERENCE_DATE;

  return SALES_MOCK_ORDER_LIST_ITEMS.filter((order) => {
    const dateKey = getKstDateKey(order.paid_at ?? order.ordered_at);
    return dateKey >= startDate && dateKey <= endDate;
  });
}

// 선택 기간 전체 주문(현재 페이지 items가 아님) 기준으로 요약을 계산한다.
// queryMockSalesOrders 내부에서만 쓰는 helper — 화면이 summary를 별도로
// 다시 조회하거나 계산하지 않도록, 목록 응답에 항상 포함해 돌려준다.
function computeSummary(periodOrders) {
  return {
    sales_amount: periodOrders.reduce(
      (sum, order) => sum + order.total_amount,
      0
    ),
    order_count: periodOrders.length,
    item_qty: periodOrders.reduce((sum, order) => sum + order.item_count, 0),
  };
}

// 화면 조회 상태를 실제 GET /api/orders 요청 파라미터로 변환한다.
// URLSearchParams에 바로 넘길 수 있는 단순한 구조를 반환할 뿐, 실제 URL
// 조립이나 fetch 호출은 하지 않는다. 화면이 실제로 쓰는 값만 포함한다
// (category/group_by 등 쓰지 않는 파라미터는 추가하지 않음).
export function buildSalesOrdersApiQuery(queryState = DEFAULT_SALES_QUERY) {
  const resolved = { ...DEFAULT_SALES_QUERY, ...queryState };
  const page = resolveQueryPage(resolved.page);
  const limit = SALES_PAGE_SIZE;
  const offset = (page - 1) * limit;

  return {
    period: resolved.period,
    limit,
    offset,
  };
}

// API 연결 전 임시: Mock 목록을 페이지 단위로 조회하는 순수 함수. 반환
// shape은 실제 GET /api/orders 응답과 동일하다 —
// { items, total, limit, offset, timezone, summary }.
// summary는 이 페이지의 items가 아니라 선택된 기간 전체 결과를 기준으로
// 계산해 항상 함께 돌려준다(화면이 별도로 요약을 다시 조회하지 않도록).
export function queryMockSalesOrders(queryState = DEFAULT_SALES_QUERY) {
  const resolved = { ...DEFAULT_SALES_QUERY, ...queryState };
  const filtered = filterOrdersByPeriod(resolved.period);

  const total = filtered.length;
  const limit = SALES_PAGE_SIZE;
  const page = resolveQueryPage(resolved.page);
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  return {
    items,
    total,
    limit,
    offset,
    timezone: SALES_TIMEZONE,
    summary: computeSummary(filtered),
  };
}

// API 연결 전 임시: order_id로 Mock 상세 단건을 조회한다. 목록 item을
// 상세처럼 확장하거나 mutate하지 않고, sales-mock-data.js가 이미 만들어둔
// 상세 전용 Mock을 그대로 찾아 돌려준다. 없으면 null.
export function queryMockSalesOrderDetail(orderId) {
  return ORDER_DETAIL_BY_ID.get(orderId) ?? null;
}

// 목록 응답(queryMockSalesOrders의 반환값, 또는 이후 실제 fetch 응답)을
// 화면 표시용 페이지 메타 정보로 변환한다. response.items를 그대로 쓸 뿐
// 다시 slice하지 않는다. timezone/summary는 응답 값을 그대로 전달하고,
// 값이 없으면(예: 방어적 fallback) 각각 SALES_TIMEZONE과 0으로 채운
// summary를 쓴다.
export function mapSalesOrdersResponseToPageInfo(response) {
  const items = response?.items ?? [];
  const total =
    Number.isInteger(response?.total) && response.total >= 0
      ? response.total
      : items.length;
  const limit =
    Number.isInteger(response?.limit) && response.limit > 0
      ? response.limit
      : SALES_PAGE_SIZE;
  const offset =
    Number.isInteger(response?.offset) && response.offset >= 0
      ? response.offset
      : 0;
  const timezone = response?.timezone ?? SALES_TIMEZONE;
  const summary = response?.summary ?? {
    sales_amount: 0,
    order_count: 0,
    item_qty: 0,
  };

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
      timezone,
      summary,
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
    timezone,
    summary,
  };
}

// 목록·상세 화면이 공유하는 시각 포맷터. ISO 문자열을 slice하지 않고,
// 명시적 timeZone(기본값 SALES_TIMEZONE)과 명시적 locale('ko-KR')로
// Intl.DateTimeFormat을 사용해 브라우저 기본 timezone/locale에 의존하지
// 않는다 — 서버(SSR)와 클라이언트가 항상 같은 문자열을 만들어야
// hydration 불일치가 나지 않는다. formatToParts로 직접 조립해
// "YYYY-MM-DD HH:MM" 형식을 고정한다(로케일 기본 구두점에 기대지 않음).
export function formatSalesDateTime(isoString, timezone = SALES_TIMEZONE) {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: timezone,
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
