import styles from '../../pos.module.css';

export default function MembershipPanel({ memberConfirmed, memberName, points }) {
  return (
    <div
      className={`${styles.statusStrip} ${memberConfirmed ? styles.show : ''}`}
    >
      <span>
        회원 확인 · {memberName} · 적립 예정 {points}P
      </span>
      <span>×</span>
    </div>
  );
}
