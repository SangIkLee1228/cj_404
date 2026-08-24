'use client';

import { useState } from 'react';
import styles from './pos.module.css';
import { usePosState } from './state/usePosState';
import TopBar from './components/layout/TopBar';
import RecognitionScreen from './components/layout/RecognitionScreen';
import CaptureScreen from './components/ai-capture/CaptureScreen';
import CustomerFloatingDisplay from './components/customer-display/CustomerFloatingDisplay';
import ConfirmModal from './components/feedback/ConfirmModal';
import Toast from './components/feedback/Toast';

export default function PosPage() {
  const pos = usePosState();
  const [pendingConfirm, setPendingConfirm] = useState(null); // 'cancel' | 'retake' | null

  const requestCancel = () => setPendingConfirm('cancel');
  const requestRetake = () => setPendingConfirm('retake');
  const closeConfirm = () => setPendingConfirm(null);

  const confirmAction = () => {
    if (pendingConfirm === 'cancel') pos.cancelOrder();
    if (pendingConfirm === 'retake') pos.openCaptureScreen('retake');
    setPendingConfirm(null);
  };

  return (
    <div className={styles.posRoot}>
      <TopBar totalAmount={pos.totalAmount} />

      {pos.state.capture.screen === 'recognition' ? (
        <RecognitionScreen
          pos={pos}
          onRequestRetake={requestRetake}
          onRequestCancel={requestCancel}
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
          description="지금까지 AI로 인식된 항목이 사라지고 새로 촬영한 결과로 바뀝니다. 직접 추가한 항목은 유지됩니다."
          confirmLabel="다시 촬영"
          onConfirm={confirmAction}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
}
