// Dashboard 판매 내역(S-07) 화면이 쓸 순수 데이터 파생 로직.
//
// React/브라우저 API에 의존하지 않는다. 요약(summary) 필드는 실제
// GET /api/stats/sales 응답의 SalesSummary와 동일한 snake_case
// (sales_amount, order_count, item_qty)를 쓴다. 주문 목록·상세 필드는
// GET /api/orders가 아직 미구현(backend/app/api/routes/orders.py는 빈
// 객체만 반환)이라 확정된 API 계약이 없다 — sales-mock-data.js에 정의한
// Sales 전용 임시 Mock 계약을 그대로 따른다.
//
// Inventory/Products의 *-data.js와 같은 구조를 참고했지만 그 파일들을
// import하지 않는다. 이 파일이 제공하는 역할은 다음과 같다.
//
//   1) buildSalesStatsApiQuery       — 화면 조회 상태 → 실제
//                                       GET /api/stats/sales 요청 파라미터
//   2) queryMockSalesOrders          — (API 연결 전 임시) Mock 주문을
//                                       페이지 단위로 조회
//   3) mapSalesOrdersResponseToPageInfo — 목록 응답 → 화면 표시용 페이지
//                                       메타 정보
//   4) getMockSalesSummary           — 기간 전체 주문 기준 요약(페이지
//                                       items가 아니라 기간 전체를 집계)
//   5) getSalesPeriodLabel           — 기간 값 → 화면 표시용 긴 라벨
import {
  SALES_MOCK_ORDERS,
  SALES_PAGE_SIZE,
  SALES_MOCK_REFERENCE_DATE,
} from './sales-mock-data';

// 화면 조회 상태의 기본값. 기간은 오늘, 1페이지부터 시작. 화면이 실수로 이
// 객체를 직접 mutate해 다른 화면 상태와 뒤섞이는 일이 없도록 freeze한다.
export const DEFAULT_SALES_QUERY = Object.freeze({
  period: 'TODAY',
  page: 1,
});

// page 값을 1 이상의 정수로 보정한다 — buildSalesStatsApiQuery와
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

function getOrderDateKey(order) {
  // 모든 타임스탬프가 'YYYY-MM-DDTHH:MM:SS+09:00' 고정 형식이라 앞 10자만
  // 잘라도 KST 달력 날짜와 정확히 일치한다.
  return (order.paid_at ?? order.ordered_at).slice(0, 10);
}

// SALES_MOCK_ORDERS(이미 paid_at 최신순 정렬)에서 PAID 상태이면서 기간
// 범위에 드는 주문만 남긴다. filter는 살아남은 요소의 상대 순서를 바꾸지
// 않으므로 다시 정렬하지 않는다. queryMockSalesOrders와
// getMockSalesSummary가 같은 필터 규칙을 공유하기 위한 내부 helper.
function filterOrdersByPeriod(period) {
  const startDate = PERIOD_START_DATE[period] ?? PERIOD_START_DATE.TODAY;
  const endDate = SALES_MOCK_REFERENCE_DATE;

  return SALES_MOCK_ORDERS.filter((order) => {
    if (order.status !== 'PAID') {
      return false;
    }
    const dateKey = getOrderDateKey(order);
    return dateKey >= startDate && dateKey <= endDate;
  });
}

// 화면 조회 상태를 실제 GET /api/stats/sales 요청 파라미터로 변환한다.
// URLSearchParams에 바로 넘길 수 있는 단순한 구조를 반환할 뿐, 실제 URL
// 조립이나 fetch 호출은 하지 않는다.
export function buildSalesStatsApiQuery(queryState = DEFAULT_SALES_QUERY) {
  const resolved = { ...DEFAULT_SALES_QUERY, ...queryState };
  const page = resolveQueryPage(resolved.page);
  const limit = SALES_PAGE_SIZE;
  const offset = (page - 1) * limit;

  return {
    period: resolved.period,
    group_by: 'PRODUCT',
    limit,
    offset,
  };
}

// API 연결 전 임시: Mock 주문을 페이지 단위로 조회하는 순수 함수. 반환
// 형태는 { items, total, limit, offset }이며, 필터를 통과한 전체 배열은
// 반환하지 않는다 — 화면은 이 함수가 돌려준 페이지 하나만 봐야 한다.
export function queryMockSalesOrders(queryState = DEFAULT_SALES_QUERY) {
  const resolved = { ...DEFAULT_SALES_QUERY, ...queryState };
  const filtered = filterOrdersByPeriod(resolved.period);

  const total = filtered.length;
  const limit = SALES_PAGE_SIZE;
  const page = resolveQueryPage(resolved.page);
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  return { items, total, limit, offset };
}

// 요약 카드용 집계. 현재 페이지 items가 아니라 기간 전체 주문을 기준으로
// 계산한다(백엔드 SalesSummary와 동일한 필드).
export function getMockSalesSummary(queryState = DEFAULT_SALES_QUERY) {
  const resolved = { ...DEFAULT_SALES_QUERY, ...queryState };
  const periodOrders = filterOrdersByPeriod(resolved.period);

  return {
    sales_amount: periodOrders.reduce(
      (sum, order) => sum + order.total_amount,
      0
    ),
    order_count: periodOrders.length,
    item_qty: periodOrders.reduce((sum, order) => sum + order.item_count, 0),
  };
}

// 목록 응답(queryMockSalesOrders의 반환값, 또는 이후 실제 fetch 응답)을
// 화면 표시용 페이지 메타 정보로 변환한다. response.items를 그대로 쓸 뿐
// 다시 slice하지 않는다.
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
