// Dashboard 운영 현황(홈, OV-1) 화면이 쓸 순수 데이터 파생 로직.
//
// React/브라우저 API에 의존하지 않는다. 이 화면의 주 계약은 실제
// GET /api/dashboard/overview이며, 실제 요청·Zod 검증은
// api/overview-api.js가 담당한다 — 이 파일은 그 응답을 화면 view model로
// 변환하는 순수 매핑만 담당한다.
//
// KPI 증감률(sales_change_pct 등)과 sales_chart.points[].order_count는
// 더 이상 화면 전용 provisional 값이 아니다 — 실제 API 응답(kpi,
// sales_chart)에 이미 포함되어 내려온다. 이 파일의 매핑 함수는 그 값을
// 그대로 쓸 뿐 재계산하지 않는다.
//
// 이 파일이 제공하는 역할은 다음과 같다.
//
//   1) buildDashboardOverviewApiQuery — 화면 조회 상태 → 실제
//                                        GET /api/dashboard/overview
//                                        요청 파라미터
//   2) OVERVIEW_PERIOD_FILTER_OPTIONS — 조회 기간 필터(SegmentedControl)
//                                        선택 항목
//   3) mapDashboardOverviewToKpiCards — 응답(kpi) → 화면 표시용 KPI 카드
//                                        view model
//   4) getOverviewPeriodLabel         — 기간 값 → 화면 표시용 라벨
//   5) formatOverviewDateTime         — timezone 기준 시각 포맷
//   6) formatWon                      — 금액 포맷
//   7) mapDashboardOverviewToSalesChart  — 응답(sales_chart) → 매출/결제
//                                        건수 Mixed Chart view model
//   8) mapDashboardOverviewToTopProductsChart — 응답(top_products/
//                                        top_products_others) → 판매
//                                        상위 품목 Doughnut Chart view
//                                        model
//   9) formatOverviewTimeLabel       — timezone 기준 "HH:MM" 시각 포맷
//                                        (최근 판매 "시간" 열 전용)
//   10) mapDashboardOverviewToRecentOrders — 응답 → 최근 판매 표 view
//                                        model(최대 6건, API 순서 유지)

const VALID_PERIODS = ['TODAY', '7D', '30D'];

// 조회 기간 필터 선택 항목(SegmentedControl용). overview-mock-data.js에
// 동일한 이름의 export가 남아 있지만, production runtime은 이제 이
// 파일의 정의만 쓴다(overview-mock-data.js는 그대로 두되 더 이상
// import하지 않는다).
export const OVERVIEW_PERIOD_FILTER_OPTIONS = [
  { value: 'TODAY', label: '오늘' },
  { value: '7D', label: '1주일' },
  { value: '30D', label: '1개월' },
];

// 화면 조회 상태의 기본값. 화면이 실수로 이 객체를 직접 mutate해 다른 화면
// 상태와 뒤섞이는 일이 없도록 freeze한다.
export const DEFAULT_OVERVIEW_QUERY = Object.freeze({
  period: 'TODAY',
});

// 유효하지 않은 period 값을 TODAY로 보정한다 — buildDashboardOverviewApiQuery
// /getOverviewPeriodLabel이 동일한 보정 규칙을 공유하기 위한 내부
// helper라 export하지 않는다.
function resolvePeriod(period) {
  return VALID_PERIODS.includes(period) ? period : 'TODAY';
}

// 화면 조회 상태를 실제 GET /api/dashboard/overview 요청 파라미터로
// 변환한다. URLSearchParams에 바로 넘길 수 있는 단순한 구조를 반환할 뿐,
// 실제 URL 조립이나 fetch 호출은 하지 않는다. 화면 전용 provisional
// 필드(*_change_pct 등)는 절대 포함하지 않는다.
export function buildDashboardOverviewApiQuery(
  queryState = DEFAULT_OVERVIEW_QUERY
) {
  const resolved = { ...DEFAULT_OVERVIEW_QUERY, ...queryState };
  return { period: resolvePeriod(resolved.period) };
}

// 기간 값을 화면 표시용 라벨로 매핑만 한다(새 업무 규칙 없음).
const PERIOD_LABEL = {
  TODAY: '오늘',
  '7D': '최근 1주일',
  '30D': '최근 1개월',
};
export function getOverviewPeriodLabel(period) {
  return PERIOD_LABEL[resolvePeriod(period)];
}

// PageHeader title("오늘 매장 현황" 등). getOverviewPeriodLabel과 같은
// 기간 라벨을 재사용한다 — 목업(frontend/docs/dashboard_mock.html)의
// 표기를 그대로 따른다.
export function getOverviewPageTitle(period) {
  return `${getOverviewPeriodLabel(period)} 매장 현황`;
}

const PRICE_FORMATTER = new Intl.NumberFormat('ko-KR');
export function formatWon(value) {
  return `${PRICE_FORMATTER.format(value)}원`;
}

// 시각을 표시한다. ISO 문자열을 slice하지 않고, 명시적 timeZone과 명시적
// locale('ko-KR')로 Intl.DateTimeFormat을 사용해 브라우저 기본
// timezone/locale에 의존하지 않는다 — 서버(SSR)와 클라이언트가 항상 같은
// 문자열을 만들어야 hydration 불일치가 나지 않는다. formatToParts로 직접
// 조립해 "YYYY-MM-DD HH:MM" 형식을 고정한다(로케일 기본 구두점에 기대지
// 않음).
export function formatOverviewDateTime(isoString, timezone) {
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

// changePct(유한수)를 UP/DOWN/FLAT trend로 판정하는 규칙을 한 곳에서만
// 적용한다 — 화면 컴포넌트는 이 결과를 그대로 쓸 뿐 다시 판정하지 않는다.
function resolveTrend(changePct) {
  if (changePct > 0) {
    return 'UP';
  }
  if (changePct < 0) {
    return 'DOWN';
  }
  return 'FLAT';
}

// 응답(kpi)만으로 KPI 카드 3개의 view model을 만든다.
// sales_change_pct/order_change_pct/item_change_pct는 실제 API가 이미
// 계산해 내려주는 값이라 여기서 재계산하지 않고 그대로 쓴다.
//
// changePct가 유한수가 아니면(Number.isFinite 기준, 비정상 응답 방어)
// changePct/trend를 null로 두어 화면이 안전하게 중립 문구로 대체할 수
// 있게 한다 — 렌더링 오류를 만들지 않는다.
export function mapDashboardOverviewToKpiCards(response) {
  const kpi = response.kpi;
  const periodLabel = getOverviewPeriodLabel(response.period);

  function resolveChangePct(rawChangePct) {
    return Number.isFinite(rawChangePct) ? rawChangePct : null;
  }

  const salesChangePct = resolveChangePct(kpi?.sales_change_pct);
  const orderChangePct = resolveChangePct(kpi?.order_change_pct);
  const itemQtyChangePct = resolveChangePct(kpi?.item_change_pct);

  return [
    {
      key: 'sales',
      label: `${periodLabel} 매출`,
      value: formatWon(kpi.sales_amount),
      rawValue: kpi.sales_amount,
      changePct: salesChangePct,
      trend: salesChangePct === null ? null : resolveTrend(salesChangePct),
    },
    {
      key: 'orders',
      label: '결제 건수',
      value: `${kpi.order_count}건`,
      rawValue: kpi.order_count,
      changePct: orderChangePct,
      trend: orderChangePct === null ? null : resolveTrend(orderChangePct),
    },
    {
      key: 'items',
      label: '판매 수량',
      value: `${kpi.item_qty}개`,
      rawValue: kpi.item_qty,
      changePct: itemQtyChangePct,
      trend: itemQtyChangePct === null ? null : resolveTrend(itemQtyChangePct),
    },
  ];
}

// 실제 응답(response.sales_chart)만으로 Mixed Chart(매출 막대 + 결제
// 건수 선) view model을 만든다. points[].order_count는 실제 API가 이미
// 함께 내려주는 값이라(서버 기본값 0) 더 이상 별도 시계열을 join하지
// 않는다. points가 있으면(labels.length > 0) 항상 결제 건수 선도 함께
// 그릴 수 있다.
export function mapDashboardOverviewToSalesChart(response) {
  const points = response.sales_chart.points;
  const labels = points.map((point) => point.label);
  const amounts = points.map((point) => point.amount);
  const orderCounts = points.map((point) => point.order_count);
  const hasOrderCountSeries = points.length > 0;

  return {
    unit: response.sales_chart.unit,
    labels,
    amounts,
    orderCounts,
    hasOrderCountSeries,
  };
}

const MAX_TOP_PRODUCTS = 5;
const OTHER_ITEM_LABEL = '기타';

function toFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

// response.top_products(이미 sold_qty 내림차순으로 정렬된 상태)에서 상위
// 5개만 쓰고, response.top_products_others로 "기타" 조각을 더해 Doughnut
// Chart view model로 변환한다. 순서는 다시 정렬하지 않고 API가 준 순서
// 그대로 쓴다. share_pct(각 상품·기타 비중)는 실제 API가 이미 계산해
// 내려주는 값이라 프론트에서 재계산하지 않고 그대로 쓴다.
//
// 도넛 중앙에 표시하는 total은 top_products 합계가 아니라
// response.kpi.item_qty(기간 전체 판매 수량)를 그대로 쓴다 —
// top_products_others.sold_qty는 이미 그 차이(기타 수량)만 담고 있으므로
// 여기서 다시 합산하지 않는다.
//
// top_products가 비어 있으면(TODAY처럼 판매 데이터가 없는 정상적인 빈
// 결과) top_products_others도 항상 0(백엔드가 같은 스냅샷 기준으로 함께
// 비운다)이므로, 이 경우 화면은 기존 빈 상태를 그대로 유지한다 —
// top_products_others만으로 "기타" 100%짜리 가짜 상품 데이터를 만들어
// 채우지 않는다.
export function mapDashboardOverviewToTopProductsChart(response) {
  const topProducts = Array.isArray(response?.top_products)
    ? response.top_products
    : [];

  if (topProducts.length === 0) {
    return { labels: [], values: [], total: 0, items: [] };
  }

  const topFive = topProducts.slice(0, MAX_TOP_PRODUCTS);
  const others = response?.top_products_others;

  const items = topFive.map((item, index) => ({
    productId: item?.product_id ?? null,
    label: item?.product_name ?? '',
    quantity: toFiniteNonNegative(item?.sold_qty),
    ratio: toFiniteNonNegative(item?.share_pct),
    colorIndex: index,
    isOther: false,
  }));

  const otherQty = toFiniteNonNegative(others?.sold_qty);
  if (otherQty > 0) {
    items.push({
      productId: null,
      label: OTHER_ITEM_LABEL,
      quantity: otherQty,
      ratio: toFiniteNonNegative(others?.share_pct),
      colorIndex: items.length,
      isOther: true,
    });
  }

  return {
    labels: items.map((item) => item.label),
    values: items.map((item) => item.quantity),
    total: toFiniteNonNegative(response?.kpi?.item_qty),
    items,
  };
}

// 최근 판매 표의 "시간" 열 전용 포맷("HH:MM"만). formatOverviewDateTime과
// 같은 안전한 패턴(명시적 timeZone/locale, formatToParts로 직접 조립)을
// 재사용하되, 날짜 없이 시:분만 필요한 이 화면 요구에 맞춰 별도로 둔다 —
// 서버(SSR)와 클라이언트가 항상 같은 문자열을 만들어야 hydration
// 불일치가 나지 않는다.
export function formatOverviewTimeLabel(isoString, timezone) {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.hour}:${parts.minute}`;
}

const MAX_RECENT_ORDERS = 6;

// response.recent_orders(실제 API 응답과 동일한 order_id/ordered_at/
// item_summary/item_count/total_amount shape)를 최근 판매 표 view model로
// 변환한다. 최대 6건까지만 쓰고, API가 준 순서를 다시 정렬하지 않는다 —
// 최대 개수 제한은 이 함수가 담당하므로 화면에서 다시 slice/sort하지
// 않아도 된다. response.timezone이 없거나 문자열이 아니면(비정상 응답)
// 브라우저 로컬 timezone에 기대는 대신 API 기본 timezone
// ('Asia/Seoul')으로 안전하게 대체한다. 원본 response/
// recent_orders 배열과 각 item은 mutate하지 않고, 화면 전용 필드를 원본
// 객체에 다시 기록하지도 않는다(map으로 새 객체만 만든다).
export function mapDashboardOverviewToRecentOrders(response) {
  const recentOrders = Array.isArray(response?.recent_orders)
    ? response.recent_orders
    : [];
  const timezone =
    typeof response?.timezone === 'string' && response.timezone
      ? response.timezone
      : 'Asia/Seoul';

  return recentOrders.slice(0, MAX_RECENT_ORDERS).map((order) => {
    const itemCount = Number.isFinite(order?.item_count) ? order.item_count : 0;
    const totalAmount = Number.isFinite(order?.total_amount)
      ? order.total_amount
      : 0;

    return {
      orderId: order?.order_id ?? null,
      timeLabel: order?.ordered_at
        ? formatOverviewTimeLabel(order.ordered_at, timezone)
        : '',
      itemSummary: order?.item_summary ?? '',
      itemCount,
      itemCountLabel: `${itemCount}개`,
      totalAmount,
      totalAmountLabel: formatWon(totalAmount),
    };
  });
}
