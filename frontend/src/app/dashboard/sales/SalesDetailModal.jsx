'use client';

import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import themeStyles from '../styles/dashboard-theme.module.css';
import styles from './sales.module.css';

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

const PRICE_FORMATTER = new Intl.NumberFormat('ko-KR');

function formatWon(amount) {
  return `${PRICE_FORMATTER.format(amount)}원`;
}

// 판매 상세 모달(읽기 전용, S-07). 판매 목록 표의 "상세" 버튼이 모두 이
// 컴포넌트 하나를 공유한다 — order/open/onOpenChange로 완전히
// 제어되며(controlled), Dialog.Trigger는 쓰지 않는다(각 행의 버튼이 이
// 모달과 DOM 트리상 서로 떨어져 있는 위치에서 열어야 하므로). Trigger가
// 없어 Radix가 "어디서 열렸는지"를 스스로 알 수 없으므로, 닫힌 뒤 포커스를
// 되돌릴 button을 returnFocusRef로 넘겨받는다. 업무 액션 버튼(환불·취소 등)은
// 두지 않는다 — 실제 GET /api/orders 계약이 없는 임시 화면이라 조회만
// 제공한다.
export default function SalesDetailModal({
  order,
  open,
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
          {order ? (
            <>
              <div className={styles.modalHeader}>
                <Dialog.Title className={styles.modalTitle}>
                  판매 상세
                </Dialog.Title>
                <Dialog.Close className={styles.modalClose} aria-label="닫기">
                  <X aria-hidden="true" size={18} />
                </Dialog.Close>
              </div>
              <Dialog.Description className={styles.visuallyHidden}>
                {`주문번호 ${order.order_id}번 판매 내역의 상세 정보입니다.`}
              </Dialog.Description>
              <div className={styles.modalBody}>
                <div className={styles.detailHead}>
                  <span className={styles.detailTime}>
                    {order.paid_at.slice(0, 16).replace('T', ' ')}
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
                          <td>{item.product_name}</td>
                          <td>
                            <StatusBadge
                              status={
                                SOURCE_TYPE_BADGE_STATUS[item.source_type]
                              }
                            >
                              {SOURCE_TYPE_LABEL[item.source_type]}
                            </StatusBadge>
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
                    <span className={styles.infoLabel}>결제 수단</span>
                    <span>{PAYMENT_METHOD_LABEL[order.payment_method]}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>CJ ONE 적립</span>
                    <span>
                      {order.member_id != null
                        ? `0.5% 적립 · ${order.point_earned}P`
                        : '미적용'}
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
                  {order.discount_amount > 0 ? (
                    <div className={styles.amountRow}>
                      <span>할인</span>
                      <span>{`-${formatWon(order.discount_amount)}`}</span>
                    </div>
                  ) : null}
                  <div className={styles.amountRowFinal}>
                    <span>최종 결제 금액</span>
                    <span>{formatWon(order.total_amount)}</span>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
