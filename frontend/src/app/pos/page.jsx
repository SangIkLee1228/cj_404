'use client';

import { useState } from 'react';
import styles from './pos.module.css';
import { usePosState } from './state/usePosState';
import { useKeyboardShortcuts } from './state/useKeyboardShortcuts';
import { formatWon } from './helpers/formatters';
import TopBar from './components/layout/TopBar';
import RecognitionScreen from './components/layout/RecognitionScreen';
import CaptureScreen from './components/ai-capture/CaptureScreen';
import CustomerFloatingDisplay from './components/customer-display/CustomerFloatingDisplay';
import ConfirmModal from './components/feedback/ConfirmModal';
import Toast from './components/feedback/Toast';

export default function PosPage() {
  const pos = usePosState();
  const [pendingConfirm, setPendingConfirm] = useState(null); // 'cancel' | 'retake' | null
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);

  const requestCancel = () => setPendingConfirm('cancel');
  const requestRetake = () => setPendingConfirm('retake');
  const closeConfirm = () => setPendingConfirm(null);
  const requestPayment = () => setPaymentConfirmOpen(true);
  const closePaymentConfirm = () => setPaymentConfirmOpen(false);

  const confirmAction = () => {
    if (pendingConfirm === 'cancel') pos.cancelOrder();
    if (pendingConfirm === 'retake') pos.openCaptureScreen('retake');
    setPendingConfirm(null);
  };

  // 촬영 완료 확인(결제 진입) 모달의 선택지는 "추가 촬영 / 결제 진행" 두 가지다(pos.md 주요 CTA).
  const confirmAddCapture = () => {
    setPaymentConfirmOpen(false);
    pos.openCaptureScreen('add');
  };
  const confirmProceedPayment = () => {
    setPaymentConfirmOpen(false);
    pos.pay();
  };

  const anyModalOpen =
    pendingConfirm !== null ||
    paymentConfirmOpen ||
    pos.state.membership.phoneOverlayOpen;

  useKeyboardShortcuts({
    screen: pos.state.capture.screen,
    isShooting: pos.isShooting,
    hasCaptured: pos.state.capture.hasCaptured,
    cartEmpty: pos.activeCart.length === 0,
    paid: pos.state.payment.paid,
    anyModalOpen,
    shoot: pos.shoot,
    openBasicCapture: () => pos.openCaptureScreen('basic'),
    removeItem: pos.removeItem,
    openPaymentConfirm: requestPayment,
    closeTopModal: () => {
      if (pendingConfirm !== null) closeConfirm();
      else if (paymentConfirmOpen) closePaymentConfirm();
      else if (pos.state.membership.phoneOverlayOpen) pos.cancelPhone();
    },
  });

  if (pos.initializing) {
    return (
      <div className={styles.posRoot}>
        <TopBar totalAmount={0} />
        <div className={styles.loadingScreen}>
          매장 데이터를 불러오는 중입니다...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.posRoot}>
      <TopBar totalAmount={pos.totalAmount} />

      {pos.state.capture.screen === 'recognition' ? (
        <RecognitionScreen
          pos={pos}
          onRequestRetake={requestRetake}
          onRequestCancel={requestCancel}
          onRequestPayment={requestPayment}
        />
      ) : (
        <CaptureScreen
          mode={pos.state.capture.mode}
          isShooting={pos.isShooting}
          onShoot={pos.shoot}
          onBack={pos.closeCaptureScreen}
        />
      )}

      <CustomerFloatingDisplay pos={pos} />
      <Toast message={pos.toast} />

      {pendingConfirm === 'cancel' && (
        <ConfirmModal
          title="계산 취소"
          description="담은 항목이 모두 사라집니다. 판매·재고에는 반영되지 않습니다."
          confirmLabel="계산 취소"
          onConfirm={confirmAction}
          onCancel={closeConfirm}
        />
      )}
      {pendingConfirm === 'retake' && (
        <ConfirmModal
          title="다시 촬영"
          description="지금까지 담긴 항목이 모두 사라지고 새로 촬영한 결과로 바뀝니다. 직접 추가한 항목도 함께 사라집니다."
          confirmLabel="다시 촬영"
          onConfirm={confirmAction}
          onCancel={closeConfirm}
        />
      )}
      {paymentConfirmOpen && (
        <ConfirmModal
          title="결제 진행 확인"
          description={`총 ${pos.totalCount}개 · ${formatWon(pos.totalAmount)}을 결제합니다.`}
          confirmLabel="결제 진행"
          cancelLabel="추가 촬영"
          onConfirm={confirmProceedPayment}
          onCancel={confirmAddCapture}
        />
      )}
    </div>
  );
}
