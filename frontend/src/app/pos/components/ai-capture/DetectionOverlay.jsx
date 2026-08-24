import styles from '../../pos.module.css';

/**
 * 인식 결과 시각화(Bounding Box) — 판단 근거일 뿐 목록보다 크게 두지 않는다.
 * detections: [{ id, name, confidence, bbox }] — bbox는 트레이 영역 기준 위치.
 * 실제 AI 연동 시 bbox는 이미지 좌표 기반 값으로 교체될 자리이며, 이 컴포넌트는
 * "detection 목록을 받아 박스를 그린다"는 역할만 담당한다.
 */
export default function DetectionOverlay({ detections }) {
  return (
    <>
      {detections.map((d) => (
        <div key={d.id} className={styles.bbox} style={d.bbox}>
          <span className={styles.tag}>{d.name}</span>
        </div>
      ))}
    </>
  );
}
