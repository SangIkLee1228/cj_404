// Dashboard 운영 현황(홈, OV-1) 전용 Mock 데이터.
//
// ⚠️ API 연결 전 임시 데이터입니다. 이 파일은 두 종류의 데이터를 명확히
// 분리해서 담는다.
//
//   1) OVERVIEW_MOCK_RESPONSES — 실제 GET /api/dashboard/overview 응답과
//      완전히 동일한 shape(kpi/sales_chart/top_products/recent_orders/
//      low_stock/updated_at 전부 포함). 이번 OV-1 단계는 KPI 3개만
//      화면에 그리지만, API 계약 자체는 이후 단계(OV-2/OV-3)를 위해
//      전체 shape를 유지한다.
//   2) OVERVIEW_MOCK_KPI_COMPARISONS — 실제 API에는 없는, 화면 전용
//      provisional 보충값. 절대 위 응답 객체 안에 섞지 않는다(아래
//      PROVISIONAL API PROPOSAL 주석 참고).
//
// TODAY/7D/30D는 서로 독립된 기간이 아니라 겹치는 조회다 — 오늘(TODAY)은
// 항상 7D/30D 안에도 포함되고, 최근 7일(7D)은 항상 30D 안에도 포함된다.
// 그래서 이 파일은 아래 두 종류의 값을 반드시 "겹치는 실제 의미"에
// 맞게 구성한다.
//   - sales_chart.points: 30D의 마지막 7개 = 7D 전체, 7D의 마지막 값(오늘)
//     amount = TODAY 총매출.
//   - recent_orders/low_stock: 세 기간 응답이 같은 현재 스냅샷
//     (CURRENT_RECENT_ORDERS/CURRENT_LOW_STOCK)을 공유한다 — 최근 주문은
//     조회 기간과 무관하게 "지금 시점 기준 최근 6건"이고, low_stock은
//     판매 통계가 아니라 "요청 시점의 현재 재고 스냅샷"이기 때문이다.
//
// POS(frontend/src/app/pos/**)의 Mock·상태와는 아무것도 공유하지 않는다.
// Inventory/Products/Sales/Alerts의 Mock 파일도 import하지 않는다 —
// 상품명이 겹칠 수 있지만 완전히 독립된 데이터다.

// 조회 기간 필터 선택 항목(SegmentedControl용).
export const OVERVIEW_PERIOD_FILTER_OPTIONS = [
  { value: 'TODAY', label: '오늘' },
  { value: '7D', label: '1주일' },
  { value: '30D', label: '1개월' },
];

// Mock이 "오늘"로 취급하는 고정 KST 날짜. Date.now()를 쓰지 않고 이 값만
// 기준으로 삼아야 서버·클라이언트 렌더링 결과가 항상 같다.
export const OVERVIEW_MOCK_REFERENCE_DATE = '2026-08-27';

function padTwoDigits(value) {
  return String(value).padStart(2, '0');
}

// 고정 기준일 문자열에서 달력 일수를 뺀 'YYYY-MM-DD'를 반환한다. Date의
// UTC 게터만 사용해 이 코드를 실행하는 서버/브라우저의 로컬 시간대와
// 무관하게 항상 같은 결과를 낸다(현재 시각을 전혀 읽지 않는 순수 달력
// 연산이다).
function subtractCalendarDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day) - days * 24 * 60 * 60 * 1000;
  const result = new Date(ms);
  return `${result.getUTCFullYear()}-${padTwoDigits(result.getUTCMonth() + 1)}-${padTwoDigits(result.getUTCDate())}`;
}

// UTC epoch ms를 'YYYY-MM-DDTHH:MM:SS+00:00' 형식으로 직접 조립한다.
function formatUtcIsoString(utcMs) {
  const dt = new Date(utcMs);
  const y = dt.getUTCFullYear();
  const mo = padTwoDigits(dt.getUTCMonth() + 1);
  const d = padTwoDigits(dt.getUTCDate());
  const h = padTwoDigits(dt.getUTCHours());
  const mi = padTwoDigits(dt.getUTCMinutes());
  const s = padTwoDigits(dt.getUTCSeconds());
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+00:00`;
}

// KST(Asia/Seoul, 연중 고정 UTC+9, DST 없음) 영업 시각을 UTC(+00:00) ISO
// 문자열로 변환한다. KST를 UTC로 변환할 때 09시 이전 시각은 UTC 기준
// 전날로 이동할 수 있다(예: KST 08시 → UTC 전날 23시) — Date.UTC 기반으로
// 달력 경계까지 포함해 정확히 변환하므로, 이 함수 자체는 hour 값과
// 무관하게 항상 올바른 UTC 인스턴트를 계산한다.
function kstWallTimeToUtcIso(dateStr, hour, minute) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d, hour, minute, 0) - 9 * 60 * 60 * 1000;
  return formatUtcIsoString(utcMs);
}

// 매출 시계열 포인트를 만든다. 순환 가중치 패턴으로 포인트 간 크기 차이를
// 주고, 정수 반올림 오차는 마지막 포인트에 흡수시켜 합계가 total과 정확히
// 일치하도록 한다. Math.random 없이 결정적.
const WEIGHT_CYCLE = [1, 1.4, 1.8, 1.2, 0.8, 1.1, 0.9];
function buildAmountPoints(count, total, labelFn) {
  const weights = Array.from(
    { length: count },
    (_, i) => WEIGHT_CYCLE[i % WEIGHT_CYCLE.length]
  );
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const amounts = weights.map((w) => Math.round((total * w) / weightSum));
  const roundingDiff = total - amounts.reduce((sum, a) => sum + a, 0);
  amounts[amounts.length - 1] += roundingDiff;
  return amounts.map((amount, i) => ({ label: labelFn(i), amount }));
}

// ---- KPI 현재 값(기간별 고정, 변경하지 않음) ----

const TODAY_SALES_AMOUNT = 412300;
const TODAY_ORDER_COUNT = 37;
const TODAY_ITEM_QTY = 128;

const SEVEN_D_SALES_AMOUNT = 2860400;
const SEVEN_D_ORDER_COUNT = 214;
const SEVEN_D_ITEM_QTY = 812;

const THIRTY_D_SALES_AMOUNT = 11845000;
const THIRTY_D_ORDER_COUNT = 890;
const THIRTY_D_ITEM_QTY = 3120;

// ---- TODAY: HOUR 시계열 ----
//
// 실제 backend(backend/app/api/routes/dashboard.py)는 TODAY일 때
// [str(h) for h in range(8, 23)] — 즉 '8'~'22' 문자열 15개를 label로
// 반환한다. "8시"처럼 단위를 붙이는 표시 변환은 이 Mock이 아니라 이후
// OV-2 차트 컴포넌트의 책임이다.
const TODAY_SALES_POINTS = buildAmountPoints(15, TODAY_SALES_AMOUNT, (i) =>
  String(8 + i)
);

// ---- 7D/30D: DAY 시계열 ----
//
// 실제 backend는 DAY 단위 label을 'YYYY-MM-DD' ISO 날짜로 반환한다(축을
// '8/27'처럼 줄여 표시하는 것도 OV-2 차트 컴포넌트의 책임이다). TODAY/7D/
// 30D는 겹치는 조회이므로, 30D의 마지막 7일 = 7D 전체, 7D의 마지막 날(오늘)
// amount = TODAY 총매출이 되도록 구간별로 나눠 만든다.
//   - 오늘(2026-08-27) 하루치 amount = TODAY_SALES_AMOUNT
//   - 이전 6일(2026-08-21~2026-08-26) 합계 = SEVEN_D_SALES_AMOUNT - TODAY_SALES_AMOUNT
//   - 이전 23일(2026-07-29~2026-08-20) 합계 = THIRTY_D_SALES_AMOUNT - SEVEN_D_SALES_AMOUNT
const PREV_6_DAYS_TOTAL = SEVEN_D_SALES_AMOUNT - TODAY_SALES_AMOUNT;
const PREV_23_DAYS_TOTAL = THIRTY_D_SALES_AMOUNT - SEVEN_D_SALES_AMOUNT;

const TODAY_DAY_POINT = {
  label: OVERVIEW_MOCK_REFERENCE_DATE,
  amount: TODAY_SALES_AMOUNT,
};

// 2026-08-21 ~ 2026-08-26 (기준일 6~1일 전), 날짜 오름차순.
const PREV_6_DAYS_POINTS = buildAmountPoints(6, PREV_6_DAYS_TOTAL, (i) =>
  subtractCalendarDays(OVERVIEW_MOCK_REFERENCE_DATE, 6 - i)
);

// 2026-07-29 ~ 2026-08-20 (기준일 29~7일 전), 날짜 오름차순.
const PREV_23_DAYS_POINTS = buildAmountPoints(23, PREV_23_DAYS_TOTAL, (i) =>
  subtractCalendarDays(OVERVIEW_MOCK_REFERENCE_DATE, 29 - i)
);

// 7D = 이전 6일 + 오늘(7개, 날짜 오름차순, 마지막이 오늘).
const SEVEN_D_SALES_POINTS = [...PREV_6_DAYS_POINTS, TODAY_DAY_POINT];

// 30D = 이전 23일 + 7D 전체(30개, 날짜 오름차순) — 그래서 30D의 마지막
// 7개는 정의상 SEVEN_D_SALES_POINTS와 완전히 동일하다.
const THIRTY_D_SALES_POINTS = [...PREV_23_DAYS_POINTS, ...SEVEN_D_SALES_POINTS];

// ---- 최근 주문(현재 스냅샷, 세 기간이 공유) ----
//
// 오늘 발생한 주문은 7D·30D 조회에도 항상 포함되므로, "최근 판매 6건"은
// 조회 기간과 무관하게 항상 같은 결과여야 한다 — TODAY/7D/30D가 각자
// 다른 주문 집합을 반환하면 실제 API 의미와 어긋난다. 세 응답 모두 이
// 배열의 얕은 복사본을 쓴다(원본을 직접 참조해 mutate하지 않기 위함이며,
// 항목 자체를 깊게 복제할 필요는 없다).
const CURRENT_RECENT_ORDERS = [
  {
    order_id: 9006,
    ordered_at: kstWallTimeToUtcIso(OVERVIEW_MOCK_REFERENCE_DATE, 19, 20),
    item_summary: '소금빵, 우유 식빵 외 1',
    item_count: 4,
    total_amount: 13800,
  },
  {
    order_id: 9005,
    ordered_at: kstWallTimeToUtcIso(OVERVIEW_MOCK_REFERENCE_DATE, 18, 42),
    item_summary: '소금빵, 우유 식빵',
    item_count: 3,
    total_amount: 11200,
  },
  {
    order_id: 9004,
    ordered_at: kstWallTimeToUtcIso(OVERVIEW_MOCK_REFERENCE_DATE, 17, 10),
    item_summary: '초코 크루아상, 에그타르트 외 1',
    item_count: 4,
    total_amount: 15600,
  },
  {
    order_id: 9003,
    ordered_at: kstWallTimeToUtcIso(OVERVIEW_MOCK_REFERENCE_DATE, 15, 5),
    item_summary: '단팥빵',
    item_count: 2,
    total_amount: 5000,
  },
  {
    order_id: 9002,
    ordered_at: kstWallTimeToUtcIso(OVERVIEW_MOCK_REFERENCE_DATE, 13, 20),
    item_summary: '우유 식빵, 팥 도넛',
    item_count: 3,
    total_amount: 10500,
  },
  {
    order_id: 9001,
    ordered_at: kstWallTimeToUtcIso(OVERVIEW_MOCK_REFERENCE_DATE, 10, 15),
    item_summary: '에그타르트',
    item_count: 1,
    total_amount: 2800,
  },
];

// ---- 재고 부족(현재 스냅샷, 세 기간이 공유) ----
//
// low_stock은 조회 기간에 따라 달라지는 판매 통계가 아니라 "요청 시점의
// 현재 재고 스냅샷"이다 — remaining_qty/produced_qty/stock_baseline_pct가
// 기간에 따라 달라질 이유가 없으므로 세 응답이 같은 배열을 공유한다.
// 배열은 상위 6개까지만 담고, 전체 부족 품목 수는 별도의
// CURRENT_LOW_STOCK_COUNT(11)로 둔다 — low_stock_count는 배열 길이보다
// 클 수 있다.
const CURRENT_LOW_STOCK = [
  {
    product_id: 2,
    product_name: '소금빵',
    remaining_qty: 3,
    produced_qty: 40,
    stock_baseline_pct: 20,
  },
  {
    product_id: 4,
    product_name: '단팥빵',
    remaining_qty: 1,
    produced_qty: 30,
    stock_baseline_pct: 20,
  },
  {
    product_id: 1,
    product_name: '우유 식빵',
    remaining_qty: 5,
    produced_qty: 35,
    stock_baseline_pct: 20,
  },
  {
    product_id: 6,
    product_name: '팥 도넛',
    remaining_qty: 0,
    produced_qty: 25,
    stock_baseline_pct: 20,
  },
  {
    product_id: 3,
    product_name: '초코 크루아상',
    remaining_qty: 4,
    produced_qty: 32,
    stock_baseline_pct: 20,
  },
  {
    product_id: 5,
    product_name: '에그타르트',
    remaining_qty: 2,
    produced_qty: 28,
    stock_baseline_pct: 20,
  },
];
const CURRENT_LOW_STOCK_COUNT = 11;

// ---- 갱신 시각(현재 스냅샷, 세 기간이 공유) ----
//
// 매장 데이터 스냅샷이 갱신된 시각이므로, 가장 최근 주문(CURRENT_RECENT_
// ORDERS[0], 2026-08-27 19:20 KST)보다 이르면 안 된다. 19:30 KST로 둔다.
const OVERVIEW_MOCK_UPDATED_AT = kstWallTimeToUtcIso(
  OVERVIEW_MOCK_REFERENCE_DATE,
  19,
  30
);

// ---- 기간별 응답 조립 ----
// top_products는 기간별로 값과 순위가 실제로 달라지는 판매 통계라서
// (판매 수량 상위 품목) 기간마다 각자 다른 값을 그대로 유지한다 —
// recent_orders/low_stock과 달리 공유하지 않는다.

const TODAY_RESPONSE = {
  period: 'TODAY',
  timezone: 'Asia/Seoul',
  kpi: {
    sales_amount: TODAY_SALES_AMOUNT,
    order_count: TODAY_ORDER_COUNT,
    item_qty: TODAY_ITEM_QTY,
    correction_rate: 0.0,
    low_stock_count: CURRENT_LOW_STOCK_COUNT,
  },
  sales_chart: {
    unit: 'HOUR',
    points: TODAY_SALES_POINTS,
  },
  top_products: [
    { product_id: 2, product_name: '소금빵', sold_qty: 30 },
    { product_id: 1, product_name: '우유 식빵', sold_qty: 25 },
    { product_id: 3, product_name: '초코 크루아상', sold_qty: 20 },
    { product_id: 4, product_name: '단팥빵', sold_qty: 15 },
    { product_id: 5, product_name: '에그타르트', sold_qty: 10 },
  ],
  recent_orders: [...CURRENT_RECENT_ORDERS],
  low_stock: [...CURRENT_LOW_STOCK],
  updated_at: OVERVIEW_MOCK_UPDATED_AT,
};

const SEVEN_D_RESPONSE = {
  period: '7D',
  timezone: 'Asia/Seoul',
  kpi: {
    sales_amount: SEVEN_D_SALES_AMOUNT,
    order_count: SEVEN_D_ORDER_COUNT,
    item_qty: SEVEN_D_ITEM_QTY,
    correction_rate: 0.0,
    low_stock_count: CURRENT_LOW_STOCK_COUNT,
  },
  sales_chart: {
    unit: 'DAY',
    points: SEVEN_D_SALES_POINTS,
  },
  top_products: [
    { product_id: 1, product_name: '우유 식빵', sold_qty: 200 },
    { product_id: 3, product_name: '초코 크루아상', sold_qty: 180 },
    { product_id: 2, product_name: '소금빵', sold_qty: 150 },
    { product_id: 5, product_name: '에그타르트', sold_qty: 120 },
    { product_id: 4, product_name: '단팥빵', sold_qty: 90 },
  ],
  recent_orders: [...CURRENT_RECENT_ORDERS],
  low_stock: [...CURRENT_LOW_STOCK],
  updated_at: OVERVIEW_MOCK_UPDATED_AT,
};

const THIRTY_D_RESPONSE = {
  period: '30D',
  timezone: 'Asia/Seoul',
  kpi: {
    sales_amount: THIRTY_D_SALES_AMOUNT,
    order_count: THIRTY_D_ORDER_COUNT,
    item_qty: THIRTY_D_ITEM_QTY,
    correction_rate: 0.0,
    low_stock_count: CURRENT_LOW_STOCK_COUNT,
  },
  sales_chart: {
    unit: 'DAY',
    points: THIRTY_D_SALES_POINTS,
  },
  top_products: [
    { product_id: 1, product_name: '우유 식빵', sold_qty: 760 },
    { product_id: 2, product_name: '소금빵', sold_qty: 640 },
    { product_id: 3, product_name: '초코 크루아상', sold_qty: 520 },
    { product_id: 6, product_name: '팥 도넛', sold_qty: 410 },
    { product_id: 5, product_name: '에그타르트', sold_qty: 300 },
  ],
  recent_orders: [...CURRENT_RECENT_ORDERS],
  low_stock: [...CURRENT_LOW_STOCK],
  updated_at: OVERVIEW_MOCK_UPDATED_AT,
};

// 실제 GET /api/dashboard/overview 응답과 완전히 동일한 shape의 기간별
// Mock response. sales_change_pct/order_change_pct/item_qty_change_pct
// 등 provisional 필드는 여기 절대 포함하지 않는다 — 아래
// OVERVIEW_MOCK_KPI_COMPARISONS로 완전히 분리한다.
export const OVERVIEW_MOCK_RESPONSES = {
  TODAY: TODAY_RESPONSE,
  '7D': SEVEN_D_RESPONSE,
  '30D': THIRTY_D_RESPONSE,
};

// PROVISIONAL API PROPOSAL:
// 현재 GET /api/dashboard/overview 응답에는 없는 화면 요구값이다.
// KPI의 전 기간 대비 증감률 표시에만 사용한다.
// 백엔드 협의 후 실제 API 필드가 확정되면 Mock 보충 조회를 제거하고
// 실제 응답으로 교체해야 한다.
export const OVERVIEW_MOCK_KPI_COMPARISONS = {
  TODAY: {
    sales_change_pct: 12.4,
    order_change_pct: 8.8,
    item_qty_change_pct: 10.1,
  },
  '7D': {
    sales_change_pct: -3.2,
    order_change_pct: 0,
    item_qty_change_pct: 4.6,
  },
  '30D': {
    sales_change_pct: 5.3,
    order_change_pct: -1.2,
    item_qty_change_pct: 0,
  },
};

// 결제 건수 시계열 포인트를 만든다. buildAmountPoints와 같은 순환 가중치
// 패턴·반올림 보정 방식을 쓰되 필드명이 amount가 아니라 order_count다 —
// 기존 buildAmountPoints와 실제 매출 시계열(TODAY_SALES_POINTS 등)은
// 전혀 건드리지 않고 이 함수만 새로 추가한다. WEIGHT_CYCLE은 이미
// 정의된 상수를 읽기만 한다(수정하지 않음).
function buildOrderCountPoints(count, total, labelFn) {
  const weights = Array.from(
    { length: count },
    (_, i) => WEIGHT_CYCLE[i % WEIGHT_CYCLE.length]
  );
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const counts = weights.map((w) => Math.round((total * w) / weightSum));
  const roundingDiff = total - counts.reduce((sum, c) => sum + c, 0);
  counts[counts.length - 1] += roundingDiff;
  return counts.map((order_count, i) => ({ label: labelFn(i), order_count }));
}

// label은 각 amount 시계열 포인트의 label을 그대로 읽어서 쓴다(날짜 계산을
// 다시 하지 않음) — 그래야 amount 시계열과 order_count 시계열이 위치별로
// 항상 정확히 같은 label을 갖는다는 게 재계산 실수 없이 구조적으로
// 보장된다.
const TODAY_ORDER_COUNT_POINTS = buildOrderCountPoints(
  15,
  TODAY_ORDER_COUNT,
  (i) => TODAY_SALES_POINTS[i].label
);

const PREV_6_DAYS_ORDER_COUNT_TOTAL = SEVEN_D_ORDER_COUNT - TODAY_ORDER_COUNT;
const PREV_23_DAYS_ORDER_COUNT_TOTAL =
  THIRTY_D_ORDER_COUNT - SEVEN_D_ORDER_COUNT;

const TODAY_DAY_ORDER_COUNT_POINT = {
  label: TODAY_DAY_POINT.label,
  order_count: TODAY_ORDER_COUNT,
};

const PREV_6_DAYS_ORDER_COUNT_POINTS = buildOrderCountPoints(
  6,
  PREV_6_DAYS_ORDER_COUNT_TOTAL,
  (i) => PREV_6_DAYS_POINTS[i].label
);

const PREV_23_DAYS_ORDER_COUNT_POINTS = buildOrderCountPoints(
  23,
  PREV_23_DAYS_ORDER_COUNT_TOTAL,
  (i) => PREV_23_DAYS_POINTS[i].label
);

// 7D = 이전 6일 + 오늘, 30D = 이전 23일 + 7D 전체 — amount 시계열과 동일한
// 중첩 구성이라, 30D의 마지막 7개는 정의상 SEVEN_D_ORDER_COUNT_POINTS와
// 완전히 동일하다.
const SEVEN_D_ORDER_COUNT_POINTS = [
  ...PREV_6_DAYS_ORDER_COUNT_POINTS,
  TODAY_DAY_ORDER_COUNT_POINT,
];
const THIRTY_D_ORDER_COUNT_POINTS = [
  ...PREV_23_DAYS_ORDER_COUNT_POINTS,
  ...SEVEN_D_ORDER_COUNT_POINTS,
];

// PROVISIONAL API PROPOSAL:
// 현재 GET /api/dashboard/overview의 sales_chart.points에는
// 시간대별/일별 결제 건수가 없다.
// 목업의 매출+결제 건수 Mixed Chart를 구성하기 위한 Mock 보충값이다.
// 백엔드 협의 후 points[].order_count가 실제 계약에 추가되면 이 별도
// Mock 시계열을 제거하고 실제 응답 필드로 교체해야 한다.
export const OVERVIEW_MOCK_ORDER_COUNT_SERIES = {
  TODAY: TODAY_ORDER_COUNT_POINTS,
  '7D': SEVEN_D_ORDER_COUNT_POINTS,
  '30D': THIRTY_D_ORDER_COUNT_POINTS,
};
