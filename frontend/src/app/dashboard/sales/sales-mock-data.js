// Dashboard 판매 내역(S-07) 전용 Mock 데이터.
//
// ⚠️ API 연결 전 임시 데이터입니다. 목록/상세 필드는 실제 계약
// (GET /api/orders, GET /api/orders/{id})에 맞춰 분리했지만, 여전히
// Mock이며 fetch는 하지 않습니다. 실제 API 연결 시 이 파일은 백엔드
// 응답으로 교체됩니다.
//
// POS(frontend/src/app/pos/**)의 Mock·상태와는 아무것도 공유하지 않습니다.
// Inventory·Products 페이지의 Mock 파일도 참고하지 않습니다 — 상품명이
// 겹칠 수 있지만 완전히 독립된 데이터입니다.
//
// 타임스탬프 형식: 실제 GET /api/orders 응답 예시가 UTC(+00:00) 오프셋을
// 쓰므로(예: "2026-08-20T09:12:30+00:00") 이 파일도 KST 영업 시각을 UTC로
// 변환해 저장한다. 화면은 이 문자열을 slice하지 않고, 목록 응답의
// timezone("Asia/Seoul")을 기준으로 Intl.DateTimeFormat으로 표시해야 한다
// (sales-data.js의 formatSalesDateTime 참고).
//
// member 필드: 실제 상세 응답 예시는 populated 상태의 shape을 보여주지
// 않는다. 이 Mock은 회원일 때 { member_id } 객체, 아니면 null로 가정한다
// — 실제 계약이 확정되면 이 가정은 재검토가 필요하다.

// Sales 목록의 페이지당 노출 개수이자 API limit 기본값.
export const SALES_PAGE_SIZE = 30;

// 목록 응답의 timezone 필드 기본값이자, 상세 화면이 목록 응답을 거치지
// 않았을 때 쓰는 fallback이다.
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

// 실제 회원 프로필 연결 없이(예: 카운터에서 이전에 적립한 포인트를 번호만
// 확인하고 사용) point_used만 존재하는 케이스를 만들기 위한 고정 인덱스
// (0-based, order_id로는 SPECIAL_NULL_MEMBER_BENEFIT_INDEX + 1). 이
// 인덱스는 아래 생성 루프에서 isMember가 false로 계산되는 값이어야 한다
// (globalIndex % 3 === 0).
const SPECIAL_NULL_MEMBER_BENEFIT_INDEX = 9;
const SPECIAL_NULL_MEMBER_BENEFIT_POINT_USED = 250;

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
// Date.prototype.toISOString()은 'Z'와 밀리초를 포함해 실제 API 예시
// 형식(밀리초 없음, '+00:00' 명시)과 달라 쓰지 않는다.
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

// KST(Asia/Seoul, 연중 고정 UTC+9, DST 없음) 영업 시각을 실제 응답 예시와
// 같은 UTC(+00:00) ISO 문자열로 변환한다. 생성 루프의 hour는 항상
// 9~20(KST) 범위라 9시간을 빼도 같은 UTC 달력 날짜 안에 머무른다(날짜
// 경계를 넘지 않음).
function kstWallTimeToUtcIso(dateStr, hour, minute) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d, hour, minute, 0) - 9 * 60 * 60 * 1000;
  return formatUtcIsoString(utcMs);
}

// 목록 item_summary를 생성 단계에서 만들어 저장한다(화면에서 다시 계산하지
// 않음). 실제 응답 예시("카망베르 치즈빵, 소금빵 외 1")와 동일하게 상품명
// 2개까지 표시하고, 초과분은 "개" 없이 "외 N"으로만 표기한다. N은
// 수량이 아니라 초과한 상품 라인 수다.
function formatItemSummary(productNames) {
  if (productNames.length <= 2) {
    return productNames.join(', ');
  }
  return `${productNames.slice(0, 2).join(', ')} 외 ${productNames.length - 2}`;
}

// 최근 30일(SALES_MOCK_REFERENCE_DATE 포함) 동안 결정적으로 PAID 주문을
// 생성해, 실제 GET /api/orders(목록)·GET /api/orders/{id}(상세) 계약에
// 맞춘 두 배열을 함께 만든다. Math.random()이나 Date.now()를 쓰지 않고
// 인덱스 기반 순환 공식만 사용해, 같은 입력에서 항상 같은 결과를 낸다.
// import 시 한 번만 호출된다.
function generateSalesMockData() {
  const listItems = [];
  const details = [];
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
      const orderId = globalIndex + 1;
      const hour = 9 + ((globalIndex * 37) % 12); // 09~20시(KST)
      const minute = (globalIndex * 13) % 60;
      const orderedAt = kstWallTimeToUtcIso(dateStr, hour, minute);
      // 결제는 촬영·정정 이후라 주문보다 몇 분 뒤로 둔다(분 캐리 계산을
      // 피하려 59분을 넘기지 않게 clamp한다).
      const paidAt = kstWallTimeToUtcIso(
        dateStr,
        hour,
        Math.min(minute + 2, 59)
      );

      const itemLineCount = 1 + (globalIndex % 4); // 1~4개 품목 라인
      const items = [];
      for (let j = 0; j < itemLineCount; j += 1) {
        const fixture =
          SALES_PRODUCT_FIXTURE[
            (globalIndex + j) % SALES_PRODUCT_FIXTURE.length
          ];
        const quantity = 1 + ((globalIndex + j) % 3); // 1~3개
        const subtotal = fixture.unit_price * quantity;
        const sourceType =
          SOURCE_TYPE_CYCLE[(globalIndex + j) % SOURCE_TYPE_CYCLE.length];
        orderItemSequence += 1;
        // AI 인식 품목 중 일부만 검토 필요로 표시한다(POS 쪽 "확인 필요
        // 항목" 개념과 동일한 성격 — 직접 추가·직원 정정 항목은 이미
        // 사람이 확정한 값이라 검토 대상이 아니다).
        const needsReview =
          sourceType === 'AI_DETECTED' && orderItemSequence % 5 === 0;

        items.push({
          order_item_id: orderItemSequence,
          product_id: fixture.product_id,
          product_name: fixture.product_name,
          quantity,
          unit_price: fixture.unit_price,
          subtotal,
          source_type: sourceType,
          needs_review: needsReview,
        });
      }

      const grossAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
      const isMember = globalIndex % 3 !== 0;
      const hasMembershipDiscount = isMember && globalIndex % 5 === 0;
      const membershipDiscountAmount = hasMembershipDiscount
        ? Math.round(grossAmount * 0.05)
        : 0;
      // 회원 여부와 무관하게 직원이 수동으로 적용할 수 있는 할인(쿠폰 등).
      const manualDiscountAmount = globalIndex % 13 === 0 ? 200 : 0;
      const discountAmount = membershipDiscountAmount + manualDiscountAmount;
      const totalAmount = grossAmount - discountAmount;
      const memberId = isMember ? 1 + (globalIndex % 40) : null;
      const pointEarned = isMember ? Math.floor(totalAmount * 0.005) : 0;
      // 회원 프로필이 연결되지 않았어도(member: null) 포인트를 사용한
      // 결제가 존재할 수 있는 케이스를 하나 포함한다 — 상세 화면이 member
      // 존재 여부만으로 CJ ONE 적용을 판정하면 안 된다는 걸 검증하기 위함.
      const pointUsed =
        globalIndex === SPECIAL_NULL_MEMBER_BENEFIT_INDEX
          ? SPECIAL_NULL_MEMBER_BENEFIT_POINT_USED
          : 0;
      // 목록의 member_applied는 "회원 프로필이 연결됐는지"가 아니라 "이
      // 주문에 CJ ONE 혜택이 실제 적용됐는지"를 뜻해야 한다 — member 객체
      // 존재만으로 판정하면, 프로필 연결 없이 포인트를 사용한 특별 케이스
      // (SPECIAL_NULL_MEMBER_BENEFIT_INDEX)가 목록에서는 "비회원"으로,
      // 상세에서는 "적용"으로 보여 계약이 어긋난다. 그래서 상세의 CJ ONE
      // 판정식(SalesDetailModal.jsx의 isCjOneApplied)과 동일한 조건을 여기
      // 생성 단계에서도 그대로 반영한다.
      const memberApplied = Boolean(
        memberId != null ||
        membershipDiscountAmount > 0 ||
        pointEarned > 0 ||
        pointUsed > 0
      );
      const itemQuantitySum = items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
      const correctionCount = globalIndex % 4 === 0 ? 1 : 0;
      const itemSummary = formatItemSummary(
        items.map((item) => item.product_name)
      );

      listItems.push({
        order_id: orderId,
        ordered_at: orderedAt,
        paid_at: paidAt,
        item_count: itemQuantitySum,
        item_summary: itemSummary,
        gross_amount: grossAmount,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        member_applied: memberApplied,
        point_earned: pointEarned,
      });

      details.push({
        order_id: orderId,
        status: 'PAID',
        ordered_at: orderedAt,
        paid_at: paidAt,
        payment_method:
          PAYMENT_METHOD_CYCLE[globalIndex % PAYMENT_METHOD_CYCLE.length],
        gross_amount: grossAmount,
        membership_discount_amount: membershipDiscountAmount,
        manual_discount_amount: manualDiscountAmount,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        member: memberId != null ? { member_id: memberId } : null,
        point_earned: pointEarned,
        point_used: pointUsed,
        correction_count: correctionCount,
        items,
      });

      globalIndex += 1;
    }
  }

  return { listItems, details };
}

function compareByPaidAtDescending(a, b) {
  if (a.paid_at === b.paid_at) {
    return 0;
  }
  // 모든 타임스탬프가 동일한 '+00:00' 오프셋의 'YYYY-MM-DDTHH:MM:SS' 고정
  // 폭 형식이라, 문자열 비교만으로도 시간 순서와 정확히 일치한다.
  return a.paid_at > b.paid_at ? -1 : 1;
}

const generated = generateSalesMockData();

// paid_at 최신순으로 이미 정렬된 목록 응답용 Mock 배열. sales-data.js는 이
// 순서를 그대로 유지하는 filter만 수행하고 다시 정렬하지 않는다.
export const SALES_MOCK_ORDER_LIST_ITEMS = [...generated.listItems].sort(
  compareByPaidAtDescending
);

// order_id로 목록과 1:1 연결되는 상세 응답용 Mock 배열(같은 paid_at
// 내림차순으로 정렬 — 조회는 sales-data.js가 order_id 기준 Map으로 한다).
export const SALES_MOCK_ORDER_DETAILS = [...generated.details].sort(
  compareByPaidAtDescending
);
