import styles from '../../pos.module.css';

/**
 * 인식 결과 시각화(Bounding Box) — 판단 근거일 뿐 목록보다 크게 두지 않는다.
 * detections: [{ id, name, bbox: { x, y, w, h }, belowThreshold }]
 *
 * bbox는 좌상단 원점·정규화 0~1이므로 그대로 %로 환산한다. 부모가 렌더된 이미지와
 * 같은 크기라는 전제이며, 그 보장은 TrayRecognition의 scanImageWrap이 한다.
 *
 * 신뢰도 수치는 화면에 노출하지 않는다(명세서 9장). 임계값 미만인 건만 테두리
 * 색으로 "확인 필요"를 표시한다.
 */
export default function DetectionOverlay({ detections }) {
  return (
    <>
      {detections.map((d) => (
        <div
          key={d.id}
          className={`${styles.bbox} ${d.belowThreshold ? styles.bboxReview : ''}`}
          style={{
            left: `${d.bbox.x * 100}%`,
            top: `${d.bbox.y * 100}%`,
            width: `${d.bbox.w * 100}%`,
            height: `${d.bbox.h * 100}%`,
          }}
        >
          <span className={styles.tag}>{d.name}</span>
        </div>
      ))}
    </>
  );
}
