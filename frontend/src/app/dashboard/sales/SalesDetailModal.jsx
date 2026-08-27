'use client';

import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import themeStyles from '../styles/dashboard-theme.module.css';
import styles from './sales.module.css';
import { formatSalesDateTime } from './sales-data';

// 인식 방식(order item.source_type) → 화면 표시 라벨/StatusBadge 상태 매핑.
// 새 업무 규칙이 아니라 이미 정해진 값(AI_DETECTED/STAFF_CORRECTED/
// MANUAL_ADD)을 화면 문구로 옮기는 상수다.
const SOURCE_TYPE_LABEL = {
  AI_DETECTED: 'AI 인식',
  STAFF_CORRECTED: '직원 정정',
  MANUAL_ADD: '직접 추가',
};

const SOURCE_TYPE_BADGE_STATUS = {
  AI_DETECTED: 'ok',
  STAFF_CORRECTED: 'low',
  MANUAL_ADD: 'low',
};

const PAYMENT_METHOD_LABEL = {
  CARD: '카드',
  EASY_PAY: '간편결제',
  POINT: '포인트',
};

// 실제 판매 목록은 PAID만 진입하지만(목록 status=PAID 필터), 계약상
// OrderDetail.status는 4개 값을 모두 허용하므로 전부 안전하게 라벨을
// 둔다 — enum에 없는 값이 와도 원본 문자열을 그대로 보여줄 뿐 깨지지
// 않는다(getStatusLabel 참고).
const STATUS_LABEL = {
  PENDING: '결제 대기',
  PAYING: '결제 처리 중',
  PAID: '결제완료',
  CANCELLED: '취소',
};

const PRICE_FORMATTER = new Intl.NumberFormat('ko-KR');

function formatWon(amount) {
  return `${PRICE_FORMATTER.format(amount)}원`;
}

function getStatusLabel(status) {
  return STATUS_LABEL[status] ?? status;
}

// payment_method는 nullable(PENDING/CANCELLED 등)이고, 계약에 없는 값이
// 올 가능성도 배제하지 않는다 — 둘 다 "미확인"으로 안전하게 표시한다.
function getPaymentMethodLabel(paymentMethod) {
  return PAYMENT_METHOD_LABEL[paymentMethod] ?? '미확인';
}

// 상세 응답에는 member_applied가 없다. member 객체 존재 여부만으로 CJ ONE
// 적용을 판정하면, "회원 프로필은 연결되지 않았지만 포인트를 사용/적립한"
// 케이스를 놓친다 — 그래서 membership_discount_amount·point_earned·
// point_used 중 하나라도 있으면 적용된 것으로 본다. 이 판정은 상세 화면
// 전용 표시 helper이고, 공통 UI나 다른 화면으로 확장하지 않는다.
function isCjOneApplied(detail) {
  return Boolean(
    detail.member ||
    detail.membership_discount_amount > 0 ||
    detail.point_earned > 0 ||
    detail.point_used > 0
  );
}

function getCjOneText(detail) {
  if (!isCjOneApplied(detail)) {
    return '미적용';
  }
  if (detail.point_earned > 0) {
    return `0.5% 적립 · ${detail.point_earned}P`;
  }
  return '적용';
}

// 판매 상세 모달(읽기 전용, S-07). 판매 목록 표의 "상세" 버튼이 모두 이
// 컴포넌트 하나를 공유한다 — orderId/order/open/onOpenChange로 완전히
// 제어되며(controlled), Dialog.Trigger는 쓰지 않는다(각 행의 버튼이 이
// 모달과 DOM 트리상 서로 떨어져 있는 위치에서 열어야 하므로). Trigger가
// 없어 Radix가 "어디서 열렸는지"를 스스로 알 수 없으므로, 닫힌 뒤 포커스를
// 되돌릴 button을 returnFocusRef로 넘겨받는다.
//
// 실제 GET /api/orders/{id} 조회(useQuery)는 부모(SalesPageContent)가
// 소유한다. 이 컴포넌트는 orderId/order/isPending/isError/onRetry
// props로만 그 상태를 반영하고, 내부에서 API를 호출하거나 cache를 직접
// 만지지 않는다. 업무 액션 버튼(환불·취소 등)은 두지 않는다.
export default function SalesDetailModal({
  orderId,
  order,
  timezone,
  open,
  isPending,
  isError,
  onRetry,
  onOpenChange,
  returnFocusRef,
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Portal은 body 바로 아래에 렌더링되어 Dashboard .theme 조상 밖에
            놓이므로, --dashboard-* 토큰이 상속되도록 Overlay·Content 둘 다
            여기서 theme 클래스를 다시 적용한다(토큰 파일 자체는 수정하지
            않음). */}
        <Dialog.Overlay
          className={`${styles.modalOverlay} ${themeStyles.theme}`}
        />
        <Dialog.Content
          className={`${styles.modalContent} ${themeStyles.theme}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const triggerButton = returnFocusRef?.current;
            if (triggerButton && triggerButton.isConnected) {
              triggerButton.focus();
            }
          }}
        >
          {/* header와 닫기 버튼은 로딩·오류 상태에서도 항상 보인다. */}
          <div className={styles.modalHeader}>
            <Dialog.Title className={styles.modalTitle}>판매 상세</Dialog.Title>
            <Dialog.Close className={styles.modalClose} aria-label="닫기">
              <X aria-hidden="true" size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.visuallyHidden}>
            {orderId
              ? `주문번호 ${orderId}번 판매 내역의 상세 정보입니다.`
              : '판매 내역 상세 정보입니다.'}
          </Dialog.Description>
          {isPending ? (
            <div className={styles.modalBody}>
              <p
                className={styles.stateMessage}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                판매 상세를 불러오는 중입니다.
              </p>
            </div>
          ) : isError ? (
            <div className={styles.modalBody}>
              <p className={styles.stateMessage} role="alert">
                판매 상세를 불러오지 못했습니다.
              </p>
              <div className={styles.stateActions}>
                <Button onClick={onRetry}>다시 시도</Button>
              </div>
            </div>
          ) : order ? (
            <div className={styles.modalBody}>
              <div className={styles.detailHead}>
                <span className={styles.detailTime}>
                  {formatSalesDateTime(
                    order.paid_at ?? order.ordered_at,
                    timezone
                  )}
                </span>
                <span className={styles.detailOrderId}>
                  {`주문번호 ${order.order_id}`}
                </span>
              </div>
              <div className={styles.detailTableWrapper}>
                <table className={styles.detailTable}>
                  <thead>
                    <tr>
                      <th scope="col">상품</th>
                      <th scope="col">인식 방식</th>
                      <th scope="col">수량</th>
                      <th scope="col">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.order_item_id}>
                        <td>{item.product_name ?? '상품명 없음'}</td>
                        <td>
                          <div className={styles.sourceCell}>
                            <StatusBadge
                              status={
                                SOURCE_TYPE_BADGE_STATUS[item.source_type]
                              }
                            >
                              {SOURCE_TYPE_LABEL[item.source_type]}
                            </StatusBadge>
                            {item.needs_review ? (
                              <StatusBadge
                                status="low"
                                aria-label={`${item.product_name ?? '상품명 없음'} 검토 필요`}
                              >
                                검토 필요
                              </StatusBadge>
                            ) : null}
                          </div>
                        </td>
                        <td>{`${item.quantity}개`}</td>
                        <td>{formatWon(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.infoBox}>
                <p className={styles.infoBoxTitle}>결제 정보</p>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>결제 상태</span>
                  <span>{getStatusLabel(order.status)}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>결제 수단</span>
                  <span>{getPaymentMethodLabel(order.payment_method)}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>CJ ONE 적립</span>
                  <span>{getCjOneText(order)}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>사용 포인트</span>
                  <span>
                    {order.point_used > 0
                      ? `${order.point_used}P 사용`
                      : '없음'}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>인식 정정</span>
                  <span>
                    {order.correction_count > 0
                      ? `${order.correction_count}건`
                      : '없음'}
                  </span>
                </div>
              </div>
              <div className={styles.amountSummary}>
                <div className={styles.amountRow}>
                  <span>상품 합계</span>
                  <span>{formatWon(order.gross_amount)}</span>
                </div>
                {order.membership_discount_amount > 0 ? (
                  <div className={styles.amountRow}>
                    <span>멤버십 할인</span>
                    <span>{`-${formatWon(order.membership_discount_amount)}`}</span>
                  </div>
                ) : null}
                {order.manual_discount_amount > 0 ? (
                  <div className={styles.amountRow}>
                    <span>수동 할인</span>
                    <span>{`-${formatWon(order.manual_discount_amount)}`}</span>
                  </div>
                ) : null}
                <div className={styles.amountRowFinal}>
                  <span>최종 결제 금액</span>
                  <span>{formatWon(order.total_amount)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
