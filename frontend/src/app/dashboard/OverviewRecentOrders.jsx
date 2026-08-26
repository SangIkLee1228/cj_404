import TableCard from './components/ui/TableCard';
import styles from './overview.module.css';

// 최근 판매(OV-3). overview-data.js의 mapDashboardOverviewToRecentOrders가
// 만든 view model(최대 6건, API 순서 그대로)을 그대로 그리는 표시
// 컴포넌트다 — props를 렌더링만 할 뿐 자체 state/effect/memo가 없고,
// 이 컴포넌트에서 정렬·개수 제한·포맷을 다시 계산하지 않는다. 주문
// 상세·페이지네이션·행 클릭 등 업무 동작은 이번 단계 범위가 아니라
// 구현하지 않는다.
export default function OverviewRecentOrders({ periodLabel, recentOrders }) {
  return (
    <TableCard
      className={styles.recentOrdersCard}
      title="최근 판매"
      headerMeta={`${periodLabel} · 최근 ${recentOrders.length}건`}
    >
      {recentOrders.length === 0 ? (
        <p
          className={styles.recentEmpty}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          아직 판매 내역이 없습니다.
        </p>
      ) : (
        <div className={styles.recentTableWrapper}>
          <table
            className={styles.recentTable}
            aria-label="운영 현황 최근 판매 내역"
          >
            <colgroup>
              <col className={styles.recentTimeColumn} />
              <col className={styles.recentProductColumn} />
              <col className={styles.recentQtyColumn} />
              <col className={styles.recentAmountColumn} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">시간</th>
                <th scope="col">상품명</th>
                <th scope="col">수량</th>
                <th scope="col">결제 금액</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.orderId}>
                  <td className={styles.recentTimeCell}>{order.timeLabel}</td>
                  <td className={styles.recentProductCell}>
                    {order.itemSummary}
                  </td>
                  <td className={styles.recentQtyCell}>
                    {order.itemCountLabel}
                  </td>
                  <td className={styles.recentAmountCell}>
                    <span className={styles.recentAmount}>
                      {order.totalAmountLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TableCard>
  );
}
