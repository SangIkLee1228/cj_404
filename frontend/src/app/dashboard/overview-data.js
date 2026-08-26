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
import {
  OVERVIEW_MOCK_RESPONSES,
  OVERVIEW_MOCK_KPI_COMPARISONS,
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
