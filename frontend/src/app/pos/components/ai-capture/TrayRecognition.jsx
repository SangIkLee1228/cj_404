import styles from '../../pos.module.css';
import DetectionOverlay from './DetectionOverlay';

/**
 * 트레이 촬영/인식 결과 영역.
 *
 * 실제로 추론한 사진(scan.imageUrl)을 그대로 띄우고 그 위에 bbox를 겹친다.
 * backend가 bbox를 **정규화 0~1**로 주므로(API명세서 4.4) 이미지 크기를 몰라도
 * %로 그대로 환산된다 — 다만 그러려면 오버레이의 기준 상자가 렌더된 이미지와
 * 정확히 같아야 한다. 그래서 이미지를 감싼 wrap이 이미지 크기에 shrink-wrap 되도록
 * 두고(레터박스 여백이 wrap 밖으로 빠진다) 그 안에 박스를 그린다.
 */
export default function TrayRecognition({ hasCaptured, isShooting, scan }) {
  if (isShooting) {
    return (
      <div className={styles.camera}>
        <div className={styles.cameraEmpty}>
          <b>인식 중입니다</b>
          <span>트레이 위 빵을 분석하고 있습니다.</span>
        </div>
      </div>
    );
  }

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

  // 사진이 없는 경우(AI 미연결 등)에는 기존 목업 트레이를 그대로 보여준다.
  if (!scan?.imageUrl) {
    return (
      <div className={styles.camera}>
        <div className={styles.tray} />
        <div className={`${styles.bread} ${styles.b1}`} />
        <div className={`${styles.bread} ${styles.b2}`} />
        <div className={`${styles.bread} ${styles.b3}`} />
      </div>
    );
  }

  // bbox가 없는 탐지 건은 그릴 위치가 없다 — 목록에는 이미 들어가 있으므로 건너뛴다.
  const detections = (scan.detections ?? []).filter(
    (d) => d.bbox && d.bbox.x != null && d.bbox.w != null
  );

  return (
    <div className={styles.camera}>
      <div className={styles.scanFrame}>
        <div className={styles.scanImageWrap}>
          {/* 서명 URL은 TTL이 있어 next/image로 최적화할 대상이 아니다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.scanImage}
            src={scan.imageUrl}
            alt="촬영된 트레이"
          />
          <DetectionOverlay detections={detections} />
        </div>
      </div>
    </div>
  );
}
