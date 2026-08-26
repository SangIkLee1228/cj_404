// Dashboard 운영 현황(홈, OV-1) 화면이 쓸 순수 데이터 파생 로직.
//
// React/브라우저 API에 의존하지 않는다. 이 화면의 주 계약은 실제
// GET /api/dashboard/overview다 — 아직 fetch는 구현하지 않고,
// overview-mock-data.js의 Mock으로 같은 shape을 흉내낸다.
//
// 실제 API 응답(kpi/sales_chart/top_products/recent_orders/low_stock/
// updated_at)과, 화면 전용 provisional 비교값(*_change_pct)을 함수
// 단위로도 명확히 분리해서 다룬다 — 둘을 한 함수·한 객체에 섞지 않는다.
//
// 이 파일이 제공하는 역할은 다음과 같다.
//
//   1) buildDashboardOverviewApiQuery — 화면 조회 상태 → 실제
//                                        GET /api/dashboard/overview
//                                        요청 파라미터
//   2) queryMockDashboardOverview     — (API 연결 전 임시) 실제 응답과
//                                        동일한 shape의 Mock 조회
//   3) getMockOverviewKpiComparison   — (API 연결 전 임시, provisional)
//                                        KPI 증감률 Mock 조회
//   4) mapDashboardOverviewToKpiCards — 응답 + provisional 비교값 →
//                                        화면 표시용 KPI 카드 view model
//   5) getOverviewPeriodLabel         — 기간 값 → 화면 표시용 라벨
//   6) formatOverviewDateTime         — timezone 기준 시각 포맷
//   7) formatWon                      — 금액 포맷
//   8) getMockOverviewOrderCountSeries   — (API 연결 전 임시, provisional)
//                                        결제 건수 시계열 Mock 조회
//   9) mapDashboardOverviewToSalesChart  — 응답 + provisional 결제 건수
//                                        시계열 → 매출/결제 건수 Mixed
//                                        Chart view model
//   10) mapDashboardOverviewToTopProductsChart — 응답 → 판매 상위 품목
//                                        Doughnut Chart view model
//   11) formatOverviewTimeLabel       — timezone 기준 "HH:MM" 시각 포맷
//                                        (최근 판매 "시간" 열 전용)
//   12) mapDashboardOverviewToRecentOrders — 응답 → 최근 판매 표 view
//                                        model(최대 6건, API 순서 유지)
import {
  OVERVIEW_MOCK_RESPONSES,
  OVERVIEW_MOCK_KPI_COMPARISONS,
  OVERVIEW_MOCK_ORDER_COUNT_SERIES,
} from './overview-mock-data';

const VALID_PERIODS = ['TODAY', '7D', '30D'];

// 화면 조회 상태의 기본값. 화면이 실수로 이 객체를 직접 mutate해 다른 화면
// 상태와 뒤섞이는 일이 없도록 freeze한다.
export const DEFAULT_OVERVIEW_QUERY = Object.freeze({
  period: 'TODAY',
});

// 유효하지 않은 period 값을 TODAY로 보정한다 — buildDashboardOverviewApiQuery
// /queryMockDashboardOverview/getMockOverviewKpiComparison이 동일한 보정
// 규칙을 공유하기 위한 내부 helper라 export하지 않는다.
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

// API 연결 전 임시: 실제 GET /api/dashboard/overview 응답과 동일한
// shape의 Mock을 기간별로 조회한다. fixture를 그대로 반환할 뿐 mutate하지
// 않는다(호출부도 이 반환값을 mutate해서는 안 된다).
export function queryMockDashboardOverview(
  queryState = DEFAULT_OVERVIEW_QUERY
) {
  const resolved = { ...DEFAULT_OVERVIEW_QUERY, ...queryState };
  const period = resolvePeriod(resolved.period);
  return OVERVIEW_MOCK_RESPONSES[period];
}

// API 연결 전 임시, PROVISIONAL: 실제 API에는 없는 KPI 증감률 비교값만
// 조회한다. 실제 응답(queryMockDashboardOverview)과는 완전히 별개의
// 함수·데이터 소스다 — 절대 한 객체로 합쳐 반환하지 않는다.
export function getMockOverviewKpiComparison(period) {
  const resolvedPeriod = resolvePeriod(period);
  return OVERVIEW_MOCK_KPI_COMPARISONS[resolvedPeriod];
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

// 응답(kpi)과 provisional 비교값(comparison)을 합쳐 KPI 카드 3개의 view
// model을 만든다. 두 소스를 여기서만 결합하고, 그 결과(각 카드 객체)
// 안에서도 실제 값(value/rawValue)과 provisional 값(changePct/trend)의
// 출처가 뒤섞이지 않도록 필드를 분리해 둔다.
//
// comparison이 없거나 changePct가 유한수가 아니면(Number.isFinite 기준)
// changePct/trend를 null로 두어 화면이 안전하게 중립 문구로 대체할 수
// 있게 한다 — 렌더링 오류를 만들지 않는다.
export function mapDashboardOverviewToKpiCards(response, comparison) {
  const kpi = response.kpi;
  const periodLabel = getOverviewPeriodLabel(response.period);

  function resolveChangePct(rawChangePct) {
    return Number.isFinite(rawChangePct) ? rawChangePct : null;
  }

  const salesChangePct = resolveChangePct(comparison?.sales_change_pct);
  const orderChangePct = resolveChangePct(comparison?.order_change_pct);
  const itemQtyChangePct = resolveChangePct(comparison?.item_qty_change_pct);

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

// API 연결 전 임시, PROVISIONAL: 실제 API에는 없는 시간대별/일별 결제
// 건수 시계열만 조회한다. 실제 응답(queryMockDashboardOverview)과는
// 완전히 별개의 함수·데이터 소스이며, 절대 한 객체로 합쳐 반환하지
// 않는다 — 결합은 mapDashboardOverviewToSalesChart에서만 한다.
export function getMockOverviewOrderCountSeries(period) {
  const resolvedPeriod = resolvePeriod(period);
  return OVERVIEW_MOCK_ORDER_COUNT_SERIES[resolvedPeriod];
}

// 실제 응답(response.sales_chart)과 provisional 결제 건수 시계열
// (orderCountSeries)을 합쳐 Mixed Chart(매출 막대 + 결제 건수 선) view
// model을 만든다. label이 위치별로 정확히 일치하는 항목만 결합하고,
// provisional 시계열이 없거나 길이/label이 어긋나면 orderCounts를 빈
// 배열로, hasOrderCountSeries를 false로 돌려준다 — 화면은 이 플래그만
// 보고 매출 막대만 안전하게 그릴 수 있다(렌더링 오류 없음). 컴포넌트가
// 두 시계열을 다시 join할 필요가 없도록 이 함수가 대신 결합해 둔다.
export function mapDashboardOverviewToSalesChart(response, orderCountSeries) {
  const points = response.sales_chart.points;
  const labels = points.map((point) => point.label);
  const amounts = points.map((point) => point.amount);

  const orderCountByLabel = new Map(
    (orderCountSeries ?? []).map((point) => [point.label, point.order_count])
  );
  const alignedOrderCounts = labels.map((label) =>
    orderCountByLabel.get(label)
  );
  const hasOrderCountSeries =
    Array.isArray(orderCountSeries) &&
    orderCountSeries.length === labels.length &&
    alignedOrderCounts.every((value) => Number.isInteger(value));

  return {
    unit: response.sales_chart.unit,
    labels,
    amounts,
    orderCounts: hasOrderCountSeries ? alignedOrderCounts : [],
    hasOrderCountSeries,
  };
}

const MAX_TOP_PRODUCTS = 5;
const OTHER_ITEM_LABEL = '기타';

function toFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

// response.top_products(이미 sold_qty 내림차순으로 정렬된 상태)에서 상위
// 5개만 쓰고, 그 뒤에 "기타"(기간 전체 수량 중 상위 5개를 뺀 나머지)를
// 더해 Doughnut Chart view model로 변환한다. 순서는 다시 정렬하지 않고
// API가 준 순서 그대로 쓴다.
//
// overallTotal은 top_products 합계가 아니라 response.kpi.item_qty(기간
// 전체 판매 수량)를 기준으로 삼는다 — 그래야 "기타"가 실제 의미를 갖고,
// 도넛 중앙·범례 비율의 분모도 항상 기간 전체 수량이 된다. 다만
// kpi.item_qty가 없거나 숫자가 아니거나(비정상 응답) 상위 5개 합계보다
// 작은 비정상 상황(topProductsTotal > overallTotal)에서는 음수 "기타"를
// 만들지 않도록 overallTotal을 topProductsTotal 아래로 내려가지 않게
// 방어한다 — 정상 응답이라면 kpi.item_qty >= topProductsTotal이 항상
// 성립하므로 이 방어는 정상 데이터의 실제 값을 바꾸지 않는다.
export function mapDashboardOverviewToTopProductsChart(response) {
  const topProducts = Array.isArray(response?.top_products)
    ? response.top_products
    : [];

  // top_products가 아예 비어 있으면(정상적인 빈 결과든, kpi.item_qty만
  // 있고 top_products가 없는 비정상 응답이든) 화면은 항상 기존 빈 상태를
  // 유지해야 한다 — kpi.item_qty만으로 "기타" 100%짜리 가짜 상품 데이터를
  // 만들어 채우지 않는다. items가 비어 있으면 컴포넌트가 빈 상태 UI를
  // 그대로 그린다.
  if (topProducts.length === 0) {
    return { labels: [], values: [], total: 0, items: [] };
  }

  const topFive = topProducts.slice(0, MAX_TOP_PRODUCTS);

  const topProductsTotal = topFive.reduce(
    (sum, item) => sum + toFiniteNonNegative(item?.sold_qty),
    0
  );

  const overallTotal = Math.max(
    toFiniteNonNegative(response?.kpi?.item_qty),
    topProductsTotal
  );
  const otherQty = Math.max(0, overallTotal - topProductsTotal);

  function computeRatio(quantity) {
    return overallTotal > 0
      ? Math.round((quantity / overallTotal) * 1000) / 10
      : 0;
  }

  const items = topFive.map((item, index) => {
    const quantity = toFiniteNonNegative(item?.sold_qty);
    return {
      productId: item?.product_id ?? null,
      label: item?.product_name ?? '',
      quantity,
      ratio: computeRatio(quantity),
      colorIndex: index,
      isOther: false,
    };
  });

  if (otherQty > 0) {
    items.push({
      productId: null,
      label: OTHER_ITEM_LABEL,
      quantity: otherQty,
      ratio: computeRatio(otherQty),
      colorIndex: items.length,
      isOther: true,
    });
  }

  return {
    labels: items.map((item) => item.label),
    values: items.map((item) => item.quantity),
    total: overallTotal,
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
// 브라우저 로컬 timezone에 기대는 대신 이 Mock 전체가 쓰는 기준
// timezone('Asia/Seoul')으로 안전하게 대체한다. 원본 response/
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
