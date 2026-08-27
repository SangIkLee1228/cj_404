import styles from '../../pos.module.css';
import DetectionOverlay from './DetectionOverlay';
import { MOCK_BBOX_SLOTS } from '../../mock-data/mockProducts';

/**
 * 트레이 촬영/인식 결과 영역.
 * 지금은 Placeholder 도형(TrayImage)을 쓰지만, 실제 AI 연동 시에는
 * 촬영된 트레이 이미지 + detections 목록만 바꿔 끼우면 되도록 분리해 둔다.
 */
export default function TrayRecognition({ hasCaptured, aiItems }) {
  const detections = aiItems.slice(0, 3).map((item, i) => ({
    id: item.name,
    name: item.name,
    confidence: item.confidence,
    bbox: MOCK_BBOX_SLOTS[i],
  }));

  if (!hasCaptured) {
    return (
      <div className={styles.camera}>
        <div className={styles.cameraEmpty}>
          <b>아직 촬영된 트레이가 없습니다</b>
          <span>오른쪽 하단의 기본 촬영 버튼을 눌러주세요.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.camera}>
      <div className={styles.tray} />
      <div className={`${styles.bread} ${styles.b1}`} />
      <div className={`${styles.bread} ${styles.b2}`} />
      <div className={`${styles.bread} ${styles.b3}`} />
      <DetectionOverlay detections={detections} />
    </div>
  );
}
