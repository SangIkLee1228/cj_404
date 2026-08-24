import styles from '../../pos.module.css';

const MODE_LABEL = { basic: '기본 촬영', add: '추가 촬영', retake: '다시 촬영' };

export default function CaptureScreen({ mode, isShooting, onShoot, onBack }) {
  return (
    <main className={styles.captureScreen}>
      <section className={styles.captureStage}>
        <div className={styles.captureMode}>{MODE_LABEL[mode]}</div>
        <div className={styles.captureCenter}>
          <div className={styles.bigCamera} />
          <div className={styles.captureTitle}>고객 트레이를 촬영해주세요</div>
          <div className={styles.captureSub}>촬영하면 빵 종류와 수량이 자동으로 계산됩니다</div>
          <button type="button" className={styles.shootBtn} disabled={isShooting} onClick={onShoot}>
            {isShooting ? '촬영 중...' : '▣ 촬영하기'}
          </button>
        </div>
        <button type="button" className={styles.captureBack} onClick={onBack}>
          ← 인식 화면으로 돌아가기
        </button>
      </section>
    </main>
  );
}
