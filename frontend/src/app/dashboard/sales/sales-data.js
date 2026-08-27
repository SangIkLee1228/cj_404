// Dashboard 판매 내역(S-07) 화면이 쓸 순수 데이터·UI 상수.
//
// React/브라우저 API에 의존하지 않는다. 이 화면의 주 계약은 실제
// GET /api/orders(목록)다 — 실제 요청·Zod 검증은 api/sales-api.js가
// 담당한다. GET /api/orders/{id}(상세)는 3/4에서 연결한다.
//
// Inventory/Products의 *-data.js와 같은 구조를 참고했지만 그 파일들을
// import하지 않는다. 이 파일이 제공하는 역할은 다음과 같다.
//
//   1) buildSalesOrdersApiQuery       — 화면 조회 상태 → 실제
//                                        GET /api/orders 요청 파라미터
//   2) mapSalesOrdersResponseToPageInfo — 목록 응답 → 화면 표시용 페이지
//                                        메타 정보(timezone/summary 포함)
//   3) getSalesPeriodLabel            — 기간 값 → 화면 표시용 긴 라벨
//   4) formatSalesDateTime            — timezone 기준 결제/주문 시각 포맷
//   5) SALES_PAGE_SIZE/SALES_PERIOD_FILTER_OPTIONS/SALES_TIMEZONE —
//      필터 UI 상수(sales-mock-data.js에 동일한 이름의 export가 남아
//      있지만, production runtime은 이제 이 파일의 정의만 쓴다)

// Sales 목록의 페이지당 노출 개수이자 실제 API 요청의 limit 값.
export const SALES_PAGE_SIZE = 30;

// 목록 응답의 timezone 필드 기본값이자, 응답에 값이 없을 때(방어적
// fallback)의 표시 기준.
export const SALES_TIMEZONE = 'Asia/Seoul';

// 조회 기간 필터 선택 항목(SegmentedControl용 짧은 라벨).
export const SALES_PERIOD_FILTER_OPTIONS = [
  { value: 'TODAY', label: '오늘' },
  { value: '7D', label: '1주일' },
  { value: '30D', label: '1개월' },
];

// 화면 조회 상태의 기본값. 기간은 오늘, 1페이지부터 시작. 화면이 실수로 이
// 객체를 직접 mutate해 다른 화면 상태와 뒤섞이는 일이 없도록 freeze한다.
export const DEFAULT_SALES_QUERY = Object.freeze({
  period: 'TODAY',
  page: 1,
});

// page 값을 1 이상의 정수로 보정한다 — buildSalesOrdersApiQuery의 내부
// helper라 export하지 않는다.
function resolveQueryPage(page) {
  const numericPage = Number(page);
  return Number.isFinite(numericPage)
    ? Math.max(1, Math.trunc(numericPage))
    : 1;
}

const PERIOD_LABEL = {
  TODAY: '오늘',
  '7D': '최근 1주일',
  '30D': '최근 1개월',
};

// 기간 값을 화면 표시용 긴 라벨로 매핑만 한다(새 업무 규칙 없음).
export function getSalesPeriodLabel(period) {
  return PERIOD_LABEL[period] ?? PERIOD_LABEL.TODAY;
}

// 화면 조회 상태를 실제 GET /api/orders 요청 파라미터로 변환한다.
// URLSearchParams에 바로 넘길 수 있는 단순한 구조를 반환할 뿐, 실제 URL
// 조립이나 fetch 호출은 하지 않는다. status는 실제 API 기본값이 이미
// "PAID"이지만, 백엔드 기본값이 바뀌어도 이 화면의 의미(결제 완료 내역만
// 표시)가 흔들리지 않도록 항상 명시한다. date_from/date_to/group_by 등
// 화면이 쓰지 않는 파라미터는 추가하지 않는다.
export function buildSalesOrdersApiQuery(queryState = DEFAULT_SALES_QUERY) {
  const resolved = { ...DEFAULT_SALES_QUERY, ...queryState };
  const page = resolveQueryPage(resolved.page);
  const limit = SALES_PAGE_SIZE;
  const offset = (page - 1) * limit;

  return {
    period: resolved.period,
    status: 'PAID',
    limit,
    offset,
  };
}

// 실제 GET /api/orders 응답을 화면 표시용 페이지 메타 정보로 변환한다.
// response.items를 그대로 쓸 뿐 다시 정렬·분할하지 않는다. timezone/
// summary는 응답 값을 그대로 전달하고, 값이 없으면(예: 방어적 fallback)
// 각각 SALES_TIMEZONE과 0으로 채운 summary를 쓴다 — summary 자체를
// 페이지 items로부터 재계산하지 않는다.
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
