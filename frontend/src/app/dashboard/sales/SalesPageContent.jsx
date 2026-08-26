'use client';

import { useRef, useState } from 'react';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import Card from '../components/ui/Card';
import TableCard from '../components/ui/TableCard';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import SalesDetailModal from './SalesDetailModal';
import dashboardLayoutStyles from '../dashboard-layout.module.css';
import styles from './sales.module.css';
import {
  DEFAULT_SALES_QUERY,
  queryMockSalesOrders,
  queryMockSalesOrderDetail,
  mapSalesOrdersResponseToPageInfo,
  getSalesPeriodLabel,
  formatSalesDateTime,
} from './sales-data';
import { SALES_PERIOD_FILTER_OPTIONS } from './sales-mock-data';

// 판매/할인 금액 표시용 포매터를 모듈 상수로 한 번만 만든다(렌더링마다
// 새로 만들지 않음).
const PRICE_FORMATTER = new Intl.NumberFormat('ko-KR');

function formatWon(amount) {
  return `${PRICE_FORMATTER.format(amount)}원`;
}

export default function SalesPageContent() {
  const [queryState, setQueryState] = useState(DEFAULT_SALES_QUERY);
  // 판매 상세 모달이 보여줄 대상. null이면 모달이 닫힌 상태다. 목록 item이
  // 아니라 queryMockSalesOrderDetail(order_id)로 조회한 상세 응답 shape을
  // 그대로 담는다 — 목록 item을 상세처럼 확장해서 넘기지 않는다.
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  // 모달을 연 실제 button element를 기억해둔다. Dialog.Trigger를 쓰지
  // 않는 controlled 모달이라 Radix가 스스로 알 수 없는, "닫힌 뒤 포커스를
  // 되돌릴 곳"을 SalesDetailModal에 명시적으로 넘기기 위함이다.
  const orderDetailTriggerRef = useRef(null);

  function handlePeriodChange(period) {
    setQueryState((prev) => ({ ...prev, period, page: 1 }));
  }

  // 목록·요약 모두 이 파일이 아니라 sales-data.js의 순수 함수 반환값을
  // 그대로 옮길 뿐, 이 컴포넌트에서 filter/sort/slice나 합계를 직접
  // 계산하지 않는다. summary는 queryMockSalesOrders가 이미 선택 기간
  // 전체 기준으로 계산해 응답에 포함해 주므로 별도로 다시 조회하지 않는다.
  const salesResponse = queryMockSalesOrders(queryState);
  const pageInfo = mapSalesOrdersResponseToPageInfo(salesResponse);
  const periodLabel = getSalesPeriodLabel(queryState.period);

  function handlePreviousPage() {
    setQueryState((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
  }

  function handleNextPage() {
    setQueryState((prev) => ({
      ...prev,
      page: Math.min(pageInfo.totalPages, prev.page + 1),
    }));
  }

  // 상세 버튼을 누르면 목록 item이 아니라 order_id를 기준으로 상세를
  // 별도 조회한다 — 실제 API 연결 시 이 자리만 fetch(`/api/orders/${id}`)로
  // 바꾸면 되도록 경계를 맞춘 구조다.
  function handleOpenOrderDetail(orderId, event) {
    orderDetailTriggerRef.current = event.currentTarget;
    setSelectedOrderDetail(queryMockSalesOrderDetail(orderId));
  }

  function handleOrderDetailOpenChange(nextOpen) {
    if (!nextOpen) {
      setSelectedOrderDetail(null);
    }
  }

  return (
    <section className={dashboardLayoutStyles.page}>
      <PageHeader
        title="판매 내역"
        description="결제 완료된 주문을 기준으로 기간별 판매 현황을 확인합니다. CJ ONE 포인트는 결제 금액의 0.5% 기준입니다."
        className={styles.salesPageHeader}
        actions={
          <div className={styles.filters}>
            {/* 시각적 레이블은 SegmentedControl의 aria-label과 의미가
                겹치므로 스크린 리더에서는 감춘다(중복 방지). */}
            <span className={styles.filterGroupLabel} aria-hidden="true">
              기간
            </span>
            <SegmentedControl
              aria-label="조회 기간 필터"
              items={SALES_PERIOD_FILTER_OPTIONS}
              value={queryState.period}
              onValueChange={handlePeriodChange}
            />
          </div>
        }
      />
      <div className={dashboardLayoutStyles.pageContent}>
        <div className={styles.contentStack}>
          <div className={styles.summaryGrid}>
            <Card className={styles.summaryCard}>
              <span className={styles.summaryLabel}>판매 금액</span>
              <span className={styles.summaryValue}>
                {formatWon(pageInfo.summary.sales_amount)}
              </span>
              <span className={styles.summarySub}>{periodLabel} 기준</span>
            </Card>
            <Card className={styles.summaryCard}>
              <span className={styles.summaryLabel}>주문 건수</span>
              <span className={styles.summaryValue}>
                {`${pageInfo.summary.order_count}건`}
              </span>
              <span className={styles.summarySub}>{periodLabel} 기준</span>
            </Card>
            <Card className={styles.summaryCard}>
              <span className={styles.summaryLabel}>판매 수량</span>
              <span className={styles.summaryValue}>
                {`${pageInfo.summary.item_qty}개`}
              </span>
              <span className={styles.summarySub}>{periodLabel} 기준</span>
            </Card>
          </div>
          <TableCard
            title={`${periodLabel} 판매 목록`}
            headerMeta={`${pageInfo.summary.order_count}건`}
          >
            {pageInfo.total === 0 ? (
              <p
                className={styles.tableEmpty}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {`${periodLabel} 판매 내역이 없습니다.`}
              </p>
            ) : (
              <>
                <div
                  className={styles.tableWrapper}
                  tabIndex={0}
                  aria-label="판매 목록 표, 좌우로 스크롤 가능"
                >
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">결제 일시</th>
                        <th scope="col">주문번호</th>
                        <th scope="col">상품</th>
                        <th scope="col">수량</th>
                        <th scope="col">할인</th>
                        <th scope="col">결제 금액</th>
                        <th scope="col">CJ ONE</th>
                        <th scope="col">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageInfo.items.map((order) => (
                        <tr key={order.order_id}>
                          <td className={styles.nowrapCell}>
                            {formatSalesDateTime(
                              order.paid_at ?? order.ordered_at,
                              pageInfo.timezone
                            )}
                          </td>
                          <td className={styles.nowrapCell}>
                            {order.order_id}
                          </td>
                          <td className={styles.productsCell}>
                            {order.item_summary}
                          </td>
                          <td className={styles.nowrapCell}>
                            {`${order.item_count}개`}
                          </td>
                          <td className={styles.nowrapCell}>
                            {order.discount_amount > 0 ? (
                              <span className={styles.discountText}>
                                {`-${formatWon(order.discount_amount)}`}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td
                            className={`${styles.nowrapCell} ${styles.totalAmount}`}
                          >
                            {formatWon(order.total_amount)}
                          </td>
                          <td className={styles.nowrapCell}>
                            {order.member_applied ? (
                              <StatusBadge status="ok">적립</StatusBadge>
                            ) : (
                              <span className={styles.nonMemberText}>
                                비회원
                              </span>
                            )}
                          </td>
                          <td>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={(event) =>
                                handleOpenOrderDetail(order.order_id, event)
                              }
                              aria-label={`주문번호 ${order.order_id} 상세 열기`}
                            >
                              상세
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <nav
                  className={styles.paginationFooter}
                  aria-label="판매 목록 페이지네이션"
                >
                  <span className={styles.paginationCount}>
                    {`총 ${pageInfo.total}건 중 ${pageInfo.rangeStart}-${pageInfo.rangeEnd}`}
                  </span>
                  <div className={styles.paginationNav}>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!pageInfo.hasPreviousPage}
                      onClick={handlePreviousPage}
                      aria-label="이전 판매 목록 페이지"
                    >
                      이전
                    </Button>
                    <span
                      className={styles.paginationPageText}
                      aria-live="polite"
                    >
                      {`${pageInfo.currentPage} / ${pageInfo.totalPages}페이지`}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!pageInfo.hasNextPage}
                      onClick={handleNextPage}
                      aria-label="다음 판매 목록 페이지"
                    >
                      다음
                    </Button>
                  </div>
                </nav>
              </>
            )}
          </TableCard>
        </div>
      </div>
      <SalesDetailModal
        order={selectedOrderDetail}
        open={selectedOrderDetail !== null}
        onOpenChange={handleOrderDetailOpenChange}
        returnFocusRef={orderDetailTriggerRef}
      />
    </section>
  );
}
