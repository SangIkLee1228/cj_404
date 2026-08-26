// Dashboard 판매 내역(S-07) 전용 Mock 데이터.
//
// ⚠️ API 연결 전 임시 데이터입니다. 요약(summary)은 실제 GET /api/stats/sales
// 응답 계약(backend/app/schemas/stats.py의 SalesSummary)과 필드를 맞췄지만,
// 주문 목록·상세는 실제 계약이 없습니다 — backend/app/api/routes/orders.py의
// GET /api/orders는 현재 빈 객체만 반환하는 미구현 stub입니다. 그래서 이
// 파일의 주문 item 구조는 GET /api/orders가 확정되기 전까지 쓰는 Sales
// 전용 임시 Mock 계약이며, 실제 API 연결 시 목록 응답 필드를 다시 대조해야
// 합니다.
//
// POS(frontend/src/app/pos/**)의 Mock·상태와는 아무것도 공유하지 않습니다.
// Inventory·Products 페이지의 Mock 파일도 참고하지 않습니다 — 상품명이
// 겹칠 수 있지만 완전히 독립된 데이터입니다.

// Sales 목록의 페이지당 노출 개수이자 API limit 기본값.
export const SALES_PAGE_SIZE = 30;

export const SALES_TIMEZONE = 'Asia/Seoul';

// Mock이 "오늘"로 취급하는 고정 KST 날짜. Date.now()를 쓰지 않고 이 값만
// 기준으로 삼아야 서버·클라이언트 렌더링 결과가 항상 같다.
export const SALES_MOCK_REFERENCE_DATE = '2026-08-26';

// 조회 기간 필터 선택 항목(SegmentedControl용 짧은 라벨). 기간별 긴 설명
// 라벨("최근 1주일" 등)은 sales-data.js의 getSalesPeriodLabel이 별도로
// 제공한다.
export const SALES_PERIOD_FILTER_OPTIONS = [
  { value: 'TODAY', label: '오늘' },
  { value: '7D', label: '1주일' },
  { value: '30D', label: '1개월' },
];

// 주문 item에 쓸 상품 fixture. dashboard_mock.html의 MASTER_PRODUCTS와
// 상품명만 겹칠 뿐(같은 매장이 다루는 품목이라는 정도의 사실적 근거),
// Inventory/Products Mock 파일을 import하지 않고 이 파일 안에서 독립적으로
// 정의한다.
const SALES_PRODUCT_FIXTURE = [
  { product_id: 1, product_name: '우유 식빵', unit_price: 4500 },
  { product_id: 2, product_name: '소금빵', unit_price: 2200 },
  { product_id: 3, product_name: '초코 크루아상', unit_price: 3500 },
  { product_id: 4, product_name: '단팥빵', unit_price: 2500 },
  { product_id: 5, product_name: '에그타르트', unit_price: 2800 },
  { product_id: 6, product_name: '팥 도넛', unit_price: 2500 },
  { product_id: 7, product_name: '아이스 아메리카노', unit_price: 3500 },
  { product_id: 8, product_name: '카페라떼', unit_price: 4000 },
  { product_id: 9, product_name: '유자차', unit_price: 3800 },
  { product_id: 10, product_name: '오렌지 주스', unit_price: 4000 },
];

const PAYMENT_METHOD_CYCLE = ['CARD', 'EASY_PAY', 'POINT'];
const SOURCE_TYPE_CYCLE = ['AI_DETECTED', 'STAFF_CORRECTED', 'MANUAL_ADD'];

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

// 'YYYY-MM-DD' + 시:분을 KST 오프셋(+09:00)을 명시한 ISO 8601 문자열로
// 합친다. UTC 변환 계산이 필요 없어(오프셋을 문자열에 직접 적으므로) 더
// 단순하고 실수 여지가 적다.
function buildKstIsoString(dateStr, hour, minute) {
  return `${dateStr}T${padTwoDigits(hour)}:${padTwoDigits(minute)}:00+09:00`;
}

// 최근 30일(SALES_MOCK_REFERENCE_DATE 포함) 동안 결정적으로 PAID 주문을
// 생성한다. Math.random()이나 Date.now()를 쓰지 않고 인덱스 기반 순환
// 공식만 사용해, 같은 입력에서 항상 같은 결과를 낸다. import 시 한 번만
// 호출된다.
function generateSalesMockOrders() {
  const orders = [];
  let orderItemSequence = 0;
  let globalIndex = 0;

  for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
    const dateStr = subtractCalendarDays(
      SALES_MOCK_REFERENCE_DATE,
      29 - dayIndex
    );
    // 하루 3~5건씩 순환(3,4,5,3,4,5,...) — 30일 합계 120건으로 "최소 90건"
    // 요구를 여유 있게 넘기고, 매일 데이터가 존재해 오늘/최근 7일/최근
    // 30일 조건을 자연히 만족한다.
    const ordersOnThisDay = 3 + (dayIndex % 3);

    for (let k = 0; k < ordersOnThisDay; k += 1) {
      const hour = 9 + ((globalIndex * 37) % 12); // 09~20시
      const minute = (globalIndex * 13) % 60;
      const orderedAt = buildKstIsoString(dateStr, hour, minute);
      // 결제는 촬영·정정 이후라 주문보다 몇 분 뒤로 둔다(분 캐리 계산을
      // 피하려 59분을 넘기지 않게 clamp한다).
      const paidAt = buildKstIsoString(dateStr, hour, Math.min(minute + 2, 59));

      const itemLineCount = 1 + (globalIndex % 4); // 1~4개 품목
      const items = [];
      for (let j = 0; j < itemLineCount; j += 1) {
        const fixture =
          SALES_PRODUCT_FIXTURE[
            (globalIndex + j) % SALES_PRODUCT_FIXTURE.length
          ];
        const quantity = 1 + ((globalIndex + j) % 3); // 1~3개
        const subtotal = fixture.unit_price * quantity;
        orderItemSequence += 1;
        items.push({
          order_item_id: orderItemSequence,
          product_id: fixture.product_id,
          // OrderItem DB 모델에는 없는 필드다. 화면이 상품명을 매번 조인해
          // 표시할 필요가 없도록 Mock item에만 미리 넣어둔다.
          product_name: fixture.product_name,
          quantity,
          unit_price: fixture.unit_price,
          subtotal,
          source_type:
            SOURCE_TYPE_CYCLE[(globalIndex + j) % SOURCE_TYPE_CYCLE.length],
        });
      }

      const grossAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
      const hasDiscount = globalIndex % 5 === 0;
      const discountAmount = hasDiscount ? Math.round(grossAmount * 0.05) : 0;
      const totalAmount = grossAmount - discountAmount;
      const isMember = globalIndex % 3 !== 0;
      const memberId = isMember ? 1 + (globalIndex % 40) : null;
      const pointEarned = isMember ? Math.floor(totalAmount * 0.005) : 0;
      const itemQuantitySum = items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
      const correctionCount = globalIndex % 4 === 0 ? 1 : 0;

      orders.push({
        order_id: globalIndex + 1,
        status: 'PAID',
        payment_method:
          PAYMENT_METHOD_CYCLE[globalIndex % PAYMENT_METHOD_CYCLE.length],
        gross_amount: grossAmount,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        member_id: memberId,
        point_earned: pointEarned,
        item_count: itemQuantitySum,
        correction_count: correctionCount,
        ordered_at: orderedAt,
        paid_at: paidAt,
        items,
      });

      globalIndex += 1;
    }
  }

  return orders;
}

function compareByPaidAtDescending(a, b) {
  if (a.paid_at === b.paid_at) {
    return 0;
  }
  // 모든 타임스탬프가 동일한 +09:00 오프셋의 'YYYY-MM-DDTHH:MM:SS' 고정
  // 폭 형식이라, 문자열 비교만으로도 시간 순서와 정확히 일치한다.
  return a.paid_at > b.paid_at ? -1 : 1;
}

// 생성 직후 결과를 mutate하지 않도록 복사본만 정렬한다.
const generatedOrders = generateSalesMockOrders();

// paid_at 최신순으로 이미 정렬된 Mock 주문 배열. sales-data.js는 이 순서를
// 그대로 유지하는 filter만 수행하고 다시 정렬하지 않는다.
export const SALES_MOCK_ORDERS = [...generatedOrders].sort(
  compareByPaidAtDescending
);
