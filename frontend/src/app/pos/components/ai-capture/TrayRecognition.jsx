import styles from '../../pos.module.css';
import DetectionOverlay from './DetectionOverlay';

/**
 * 트레이 촬영/인식 결과 영역.
 * AI 추론 서버가 아직 연결되지 않아(POST /scan-sessions/{id}/recognize가 501)
 * 실제 bbox 데이터가 없다 — 연결되면 detected_items[].bbox를 그대로 여기 꽂으면 된다.
 */
export default function TrayRecognition({ hasCaptured, aiItems }) {
  const detections = aiItems
    .filter((item) => item.bbox)
    .slice(0, 3)
    .map((item) => ({
      id: item.name,
      name: item.name,
      bbox: item.bbox,
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
