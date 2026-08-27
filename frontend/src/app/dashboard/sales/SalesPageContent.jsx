'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  SALES_PERIOD_FILTER_OPTIONS,
  buildSalesOrdersApiQuery,
  mapSalesOrdersResponseToPageInfo,
  getSalesPeriodLabel,
  formatSalesDateTime,
} from './sales-data';
import {
  salesQueryKeys,
  fetchSalesOrders,
  fetchSalesOrderDetail,
} from '../api/sales-api';

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

// 판매/할인 금액 표시용 포매터를 모듈 상수로 한 번만 만든다(렌더링마다
// 새로 만들지 않음).
const PRICE_FORMATTER = new Intl.NumberFormat('ko-KR');

function formatWon(amount) {
  return `${PRICE_FORMATTER.format(amount)}원`;
}

export default function SalesPageContent() {
  const queryClient = useQueryClient();
  const [queryState, setQueryState] = useState(DEFAULT_SALES_QUERY);
  // 상세 모달이 조회할 대상. null이면 모달이 닫힌 상태다. 목록 item을
  // 상세처럼 복제하지 않고 order_id만 들고 있다가 별도 query로 조회한다.
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  // 모달을 연 실제 button element를 기억해둔다. Dialog.Trigger를 쓰지
  // 않는 controlled 모달이라 Radix가 스스로 알 수 없는, "닫힌 뒤 포커스를
  // 되돌릴 곳"을 SalesDetailModal에 명시적으로 넘기기 위함이다.
  const orderDetailTriggerRef = useRef(null);

  function handlePeriodChange(period) {
    setQueryState((prev) => ({ ...prev, period, page: 1 }));
  }

  // 판매 목록 query. normalizedQuery(=buildSalesOrdersApiQuery 결과)를
  // queryKey에 그대로 실어 기간·페이지 조합마다 별도로 캐시된다.
  // Foundation의 retry/refetchOnWindowFocus 기본 정책을 그대로 쓴다.
  const normalizedQuery = buildSalesOrdersApiQuery(queryState);
  const salesQuery = useQuery({
    queryKey: salesQueryKeys.list(normalizedQuery),
    queryFn: ({ signal }) => fetchSalesOrders(queryState, { signal }),
  });
  const pageInfo = salesQuery.isSuccess
    ? mapSalesOrdersResponseToPageInfo(salesQuery.data)
    : null;
  const periodLabel = getSalesPeriodLabel(queryState.period);

  // 판매 상세 query. 목록 query와 완전히 독립된 queryKey를 쓴다 — 상세
  // 실패가 KPI·목록을 가리거나, 목록 재조회가 상세에 영향을 주지 않는다.
  // selectedOrderId가 없으면(모달이 닫힌 상태) enabled=false라 GET 자체가
  // 나가지 않는다.
  const detailQuery = useQuery({
    queryKey: salesQueryKeys.detail(selectedOrderId),
    queryFn: ({ signal }) => fetchSalesOrderDetail(selectedOrderId, { signal }),
    enabled: isPositiveInteger(selectedOrderId),
  });

  function handlePreviousPage() {
    setQueryState((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
  }

  function handleNextPage() {
    setQueryState((prev) => ({
      ...prev,
      page: Math.min(pageInfo?.totalPages ?? prev.page, prev.page + 1),
    }));
  }

  function handleOpenOrderDetail(orderId, event) {
    orderDetailTriggerRef.current = event.currentTarget;
    setSelectedOrderId(orderId);
  }

  // 모달을 닫을 때 진행 중인 상세 요청이 있으면 취소한다 — 버튼을 누르고
  // 바로 닫아도 완료되지 않은 GET이 불필요한 오류 문구를 남기지 않는다.
  // cache를 직접 수정(setQueryData 등)하지 않고 취소만 요청한다.
  function handleOrderDetailOpenChange(nextOpen) {
    if (!nextOpen) {
      if (selectedOrderId !== null) {
        queryClient.cancelQueries({
          queryKey: salesQueryKeys.detail(selectedOrderId),
        });
      }
      setSelectedOrderId(null);
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
        {salesQuery.isPending ? (
          <Card className={styles.stateCard}>
            <p
              className={styles.stateMessage}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              판매 내역을 불러오는 중입니다.
            </p>
          </Card>
        ) : salesQuery.isError ? (
          <Card className={styles.stateCard}>
            <p className={styles.stateMessage} role="alert">
              판매 내역을 불러오지 못했습니다.
            </p>
            <div className={styles.stateActions}>
              <Button onClick={() => salesQuery.refetch()}>다시 시도</Button>
            </div>
          </Card>
        ) : (
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
        )}
      </div>
      <SalesDetailModal
        orderId={selectedOrderId}
        order={detailQuery.data ?? null}
        timezone={pageInfo?.timezone}
        open={selectedOrderId !== null}
        isPending={detailQuery.isPending}
        isError={detailQuery.isError}
        onRetry={() => detailQuery.refetch()}
        onOpenChange={handleOrderDetailOpenChange}
        returnFocusRef={orderDetailTriggerRef}
      />
    </section>
  );
}
