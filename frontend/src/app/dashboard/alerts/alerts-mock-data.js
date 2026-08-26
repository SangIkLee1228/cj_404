// Dashboard 알림(S-12) 전용 Mock 데이터.
//
// ⚠️ API 연결 전 임시 데이터입니다. 필드는 실제 GET /api/notifications 응답
// 계약(backend/app/api/routes/notifications.py 확인 기준)과 동일한
// snake_case를 쓴다. Inventory/Products/Sales의 Mock 파일도 참고하지 않는다
// — 상품명이 겹칠 수 있지만 완전히 독립된 데이터다.
//
// POS(frontend/src/app/pos/**)의 Mock·상태와는 아무것도 공유하지 않는다.

// 알림 목록의 페이지당 노출 개수. 실제 GET /api/notifications의 limit
// 기본값(50)과는 역할이 다르다 — 50은 클라이언트가 limit을 생략했을 때
// 서버가 적용하는 기본 응답 크기이고, 이 화면은 다른 Dashboard 목록
// 화면(Inventory/Products/Sales)과 동일한 12개 페이지 크기를 항상 명시적
// 으로 요청한다(alerts-data.js의 buildNotificationsApiQuery 참고).
export const ALERTS_PAGE_SIZE = 12;

// Mock이 "오늘"로 취급하는 고정 KST 날짜. Date.now()를 쓰지 않고 이 값만
// 기준으로 삼아야 서버·클라이언트 렌더링 결과가 항상 같다.
export const ALERTS_MOCK_REFERENCE_DATE = '2026-08-26';

// 읽음 상태 필터 선택 항목(SegmentedControl용).
export const READ_STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'UNREAD', label: '안 읽음' },
];

// 알림 유형 필터 선택 항목(SegmentedControl용). 저장소에서 현재 확인되는
// notif_type만 필터로 노출한다(STOCK_LOW/SYSTEM) — 존재하지 않는
// STOCK_OUT 등은 만들지 않는다.
export const NOTIFICATION_TYPE_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'STOCK_LOW', label: '재고 알림' },
  { value: 'SYSTEM', label: '시스템' },
];

// 재고 알림(STOCK_LOW)에 쓸 상품 fixture. Inventory/Products Mock 파일을
// import하지 않고 이 파일 안에서 독립적으로 정의한다.
const STOCK_ALERT_PRODUCTS = [
  { product_id: 2, product_name: '소금빵' },
  { product_id: 4, product_name: '단팥빵' },
  { product_id: 1, product_name: '우유 식빵' },
  { product_id: 6, product_name: '팥 도넛' },
  { product_id: 3, product_name: '초코 크루아상' },
];

// 재고 알림의 잔여 수량 스냅샷 순환값. 0(품절)과 1 이상(임박) 케이스를
// 모두 포함한다.
const REMAINING_QTY_CYCLE = [0, 2, 4, 1, 6];

// 시스템 알림(SYSTEM) 문구 fixture. 마지막 항목은 "긴 제목 또는 긴 메시지"
// 요구를 만족시키기 위해 의도적으로 길게 작성했다.
const SYSTEM_MESSAGE_FIXTURE = [
  {
    title: '야간 재고 동기화 완료',
    message:
      '전일 23:00~06:00 사이 매장 재고 데이터가 정상적으로 동기화되었습니다.',
  },
  {
    title: 'POS 연결 점검 알림',
    message:
      'POS 연결이 일시적으로 지연되어 재고 반영이 늦어질 수 있습니다. 잠시 후 다시 확인해주세요.',
  },
  {
    title: '월간 판매 리포트 생성 완료',
    message:
      '지난달 판매·재고 리포트가 생성되었습니다. 판매 통계 화면에서 확인할 수 있습니다.',
  },
  {
    title: '시스템 정기 점검 및 데이터 정합성 검사 결과 안내(자동 생성 리포트)',
    message:
      '지난 주 매장 운영 데이터(판매, 재고, 알림)에 대한 정기 정합성 검사를 수행한 결과, 모든 항목이 정상 범위 내에 있는 것으로 확인되었습니다. 별도로 확인이 필요한 조치 사항은 없으며, 다음 정기 점검은 익월 동일 시점에 자동으로 진행됩니다.',
  },
];

const TOTAL_COUNT = 32;

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
// 8~18(KST) 범위라 9시간을 빼도 같은 UTC 달력 날짜 안에 머무른다(날짜
// 경계를 넘지 않음).
function kstWallTimeToUtcIso(dateStr, hour, minute) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d, hour, minute, 0) - 9 * 60 * 60 * 1000;
  return formatUtcIsoString(utcMs);
}

// 최근 11일에 걸쳐 결정적으로 알림을 생성한다. Math.random()이나
// Date.now()를 쓰지 않고 인덱스 기반 순환 공식만 사용해, 같은 입력에서
// 항상 같은 결과를 낸다. import 시 한 번만 호출된다.
function generateAlertsMockNotifications() {
  const items = [];

  for (let i = 0; i < TOTAL_COUNT; i += 1) {
    const dayOffset = i % 11; // 0~10일 전, 최근 11일에 분산
    const dateStr = subtractCalendarDays(ALERTS_MOCK_REFERENCE_DATE, dayOffset);
    const hour = 8 + ((i * 7) % 11); // 08~18시(KST)
    const minute = (i * 17) % 60;
    const createdAt = kstWallTimeToUtcIso(dateStr, hour, minute);

    // 대략 4건 중 1건은 SYSTEM, 나머지는 STOCK_LOW — 재고 알림이 다수인
    // 실제 매장 알림 분포를 흉내낸다.
    const isSystem = i % 4 === 3;
    const isRead = i % 3 === 0; // 대략 1/3만 읽음 처리(안읽음이 다수)

    if (isSystem) {
      const fixture = SYSTEM_MESSAGE_FIXTURE[i % SYSTEM_MESSAGE_FIXTURE.length];
      items.push({
        notification_id: i + 1,
        notif_type: 'SYSTEM',
        related_product_id: null,
        product_name: null,
        title: fixture.title,
        message: fixture.message,
        remaining_qty_snapshot: null,
        is_read: isRead,
        created_at: createdAt,
      });
    } else {
      const product = STOCK_ALERT_PRODUCTS[i % STOCK_ALERT_PRODUCTS.length];
      const qty = REMAINING_QTY_CYCLE[i % REMAINING_QTY_CYCLE.length];
      const title =
        qty === 0
          ? `${product.product_name} 매진`
          : `${product.product_name} 매진 임박`;
      const message =
        qty === 0
          ? '재고가 모두 소진되었습니다. 재진열 또는 추가 생산 여부를 확인해주세요.'
          : `현재 ${qty}개 남았습니다. 재진열 또는 추가 생산 여부를 확인해주세요.`;

      items.push({
        notification_id: i + 1,
        notif_type: 'STOCK_LOW',
        related_product_id: product.product_id,
        product_name: product.product_name,
        title,
        message,
        remaining_qty_snapshot: qty,
        is_read: isRead,
        created_at: createdAt,
      });
    }
  }

  // created_at 정렬(§compareNotifications) 규칙에 동률 케이스가 실제로
  // 존재하는지를 검증할 수 있도록, 서로 다른 두 항목의 created_at을
  // 의도적으로 동일하게 맞춘다. notification_id 내림차순 tie-break가
  // 이 두 항목 사이에서 실제로 동작해야 한다.
  items[17] = { ...items[17], created_at: items[5].created_at };

  return items;
}

function compareNotifications(a, b) {
  if (a.created_at !== b.created_at) {
    // 모든 타임스탬프가 동일한 '+00:00' 오프셋의 'YYYY-MM-DDTHH:MM:SS' 고정
    // 폭 형식이라, 문자열 비교만으로도 시간 순서와 정확히 일치한다.
    return a.created_at > b.created_at ? -1 : 1;
  }
  // 동일 시각이면 notification_id 내림차순.
  return b.notification_id - a.notification_id;
}

const generatedNotifications = generateAlertsMockNotifications();

// created_at 최신순(동률이면 notification_id 내림차순)으로 이미 정렬된
// Mock 알림 배열. alerts-data.js는 이 순서를 그대로 유지하는 filter만
// 수행하고 다시 정렬하지 않는다.
export const ALERTS_MOCK_NOTIFICATIONS = [...generatedNotifications].sort(
  compareNotifications
);
