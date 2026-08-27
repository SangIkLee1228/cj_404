import { useRef, useState } from 'react';
import styles from '../../pos.module.css';
import PhoneKeypad from '../membership/PhoneKeypad';
import { formatWon, maskMemberName } from '../../helpers/formatters';

const FRAME_WIDTH = 390;
const FRAME_HEIGHT = 624;

/**
 * 고객용 Floating Display — 항상 390×624 고정, 직원 상태를 구독하는 표시 전용 파생 뷰다.
 * 조작 지점은 CJ ONE 번호 입력(PhoneKeypad)과, 헤더를 잡고 위치를 옮기는 드래그뿐이다.
 * Pointer Capture를 헤더 요소 자체에 거는 방식이라 document 레벨 리스너를 추가/해제할 필요가 없다.
 */
export default function CustomerFloatingDisplay({ pos }) {
  const {
    state,
    activeCart,
    totalCount,
    totalAmount,
    points,
    popularTop3,
    customerViewState,
    memberName,
  } = pos;
  const { membership, payment } = state;
  const greeting = customerViewState === 'greeting';
  const visibleItems = activeCart.slice(0, 4);

  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const [framePos, setFramePos] = useState(null); // null이면 CSS 기본 위치(left:14px, top:66px) 사용

  const clampToViewport = (left, top) => {
    const maxLeft = Math.max(0, window.innerWidth - FRAME_WIDTH);
    const maxTop = Math.max(0, window.innerHeight - FRAME_HEIGHT);
    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop),
    };
  };

  const handleHeaderPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const rect = containerRef.current.getBoundingClientRect();
    dragRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleHeaderPointerMove = (e) => {
    if (!dragRef.current) return;
    const { offsetX, offsetY } = dragRef.current;
    setFramePos(clampToViewport(e.clientX - offsetX, e.clientY - offsetY));
  };
  const endDrag = (e) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const statusText = payment.paid
    ? '결제 완료'
    : membership.memberConfirmed
      ? 'CJ ONE 확인 완료'
      : state.capture.hasCaptured
        ? '담긴 상품 확인'
        : '상품 확인';

  const actionText = payment.paid
    ? membership.memberConfirmed
      ? 'CJ ONE 적립·결제가 완료되었습니다'
      : '결제가 완료되었습니다'
    : payment.failed
      ? '재시도 중'
      : membership.memberConfirmed
        ? '포인트 적립 예정 · 결제 대기'
        : '결제 대기';

  return (
    <div
      className={styles.floating}
      ref={containerRef}
      style={framePos ? { left: framePos.left, top: framePos.top } : undefined}
    >
      <div
        className={styles.floatingHead}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        고객용 세로 디스플레이 <span>TOUS les JOURS</span>
      </div>

      {greeting ? (
        <div
          className={`${styles.customerBody} ${styles.customerGreeting} ${styles.show}`}
        >
          <div className={styles.greetingBrand}>
            <div className={styles.tljLogo}>
              TOUS <small>les</small> JOURS
            </div>
            <div className={styles.customerStatusTop}>
              <i />
              <span>계산 준비</span>
            </div>
          </div>
          <div className={styles.greetingStage}>
            <div className={styles.greetingLogo}>
              <img
                src="/dashboard/logo.png"
                alt="TOUS les JOURS"
                className={styles.greetingLogoImg}
              />
            </div>
            <div className={styles.greetingSmall}>어서오세요</div>
            <div className={styles.greetingBig}>뚜레쥬르입니다</div>
            <div className={styles.greetingDesc}>
              스냅빵이 빠르고 정확한 계산을 도와드릴게요.
              <br />
              트레이를 올려주시면 직원이 촬영을 시작합니다.
            </div>
            <div className={styles.greetingBreads} aria-hidden="true">
              <span>🥐</span>
              <span>🍞</span>
              <span>🥖</span>
            </div>
            <div className={styles.greetingWait}>트레이를 올려주세요</div>
          </div>
        </div>
      ) : (
        <div className={`${styles.customerBody} ${styles.customerDisplay}`}>
          <div className={styles.customerBrandRow}>
            <div className={styles.tljLogo}>
              TOUS <small>les</small> JOURS
            </div>
            <div className={styles.customerStatusTop}>
              <i />
              <span>{statusText}</span>
            </div>
          </div>

          <div className={styles.customerHero}>
            <div className={styles.heroCopy}>
              맛있는 하루가
              <br />
              되시길 바라요!
            </div>
            <div className={styles.heroBreads} aria-hidden="true">
              <span>🥐</span>
              <span>🥖</span>
              <span>🍞</span>
            </div>
          </div>

          <div className={styles.orderCard}>
            <div className={styles.orderTitle}>
              <b>주문 내역</b>
              <span>총 {totalCount}개</span>
            </div>
            <div>
              {visibleItems.map((item) => (
                <div className={styles.customerItem} key={item.name}>
                  <div className={styles.customerItemMain}>
                    <span className={styles.customerThumb}>
                      {item.emoji || '🥐'}
                    </span>
                    <b>
                      {item.name} × {item.qty}
                    </b>
                  </div>
                  <span>{formatWon(item.price * item.qty)}</span>
                </div>
              ))}
              {activeCart.length > 4 && (
                <div className={styles.customerMore}>
                  외 {activeCart.length - 4}개 품목
                </div>
              )}
            </div>
          </div>

          <div className={styles.customerTotalPanel}>
            <span>결제 금액</span>
            <strong>{formatWon(totalAmount)}</strong>
          </div>

          <div className={styles.customerOneRow}>
            <div className={styles.cjMark}>
              CJ
              <br />
              ONE
            </div>
            <div className={styles.cjCopy}>
              <b>CJ ONE 멤버십</b>
              <small>휴대폰 번호로 간편 적립</small>
            </div>
            <div
              className={`${styles.customerMemberInfo} ${membership.memberConfirmed ? styles.show : ''}`}
            >
              {membership.memberConfirmed
                ? `${maskMemberName(memberName)} · ${payment.paid ? `${points}P 적립 완료` : `적립 예정 ${points}P`}`
                : ''}
            </div>
          </div>

          <div
            className={`${styles.customerPopular} ${activeCart.length > 0 && !payment.paid ? styles.show : ''}`}
          >
            <div className={styles.popularHead}>
              <b>오늘의 인기 상품 TOP3</b>
              <span>재고·판매 데이터 기준</span>
            </div>
            <div className={styles.popularGrid}>
              {popularTop3.map((p) => (
                <div className={styles.popularCard} key={p.productId}>
                  <div className={styles.popularIcon}>{p.emoji}</div>
                  <div className={styles.popularName}>{p.name}</div>
                  <div className={styles.popularMeta}>{formatWon(p.price)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.customerAction}>{actionText}</div>
          <div className={styles.customerThanks}>
            🍞 감사합니다
            <small>TOUS les JOURS</small>
          </div>
        </div>
      )}

      {membership.phoneOverlayOpen && (
        <div className={`${styles.customerOverlay} ${styles.open}`}>
          <PhoneKeypad
            phone={membership.phone}
            lookupFailed={membership.lookupFailed}
            onKey={pos.phoneKey}
            onCancel={pos.cancelPhone}
            onConfirm={pos.confirmPhone}
          />
        </div>
      )}
    </div>
  );
}
