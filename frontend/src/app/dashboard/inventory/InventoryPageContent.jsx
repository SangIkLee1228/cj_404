'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import SelectControl from '../components/ui/SelectControl';
import NoticeCard from '../components/ui/NoticeCard';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import TableCard from '../components/ui/TableCard';
import InventoryAdjustmentModal from './InventoryAdjustmentModal';
import dashboardLayoutStyles from '../dashboard-layout.module.css';
import styles from './inventory.module.css';
import {
  DEFAULT_INVENTORY_QUERY,
  PRODUCT_TYPE_FILTER_OPTIONS,
  STOCK_STATUS_FILTER_OPTIONS,
  CATEGORY_FILTER_OPTIONS,
  buildInventoryApiQuery,
  mapInventoryResponseToPageInfo,
  mapInventoryResponsesToUrgentRestockBread,
} from './inventory-data';
import {
  inventoryQueryKeys,
  fetchInventoryList,
  fetchUrgentRestockBread,
  restockInventoryProduct,
} from '../api/inventory-api';

// API 응답의 stock_status/product_type 값을 화면 표시용 한글 라벨로
// 매핑만 하는 상수(새 판정 로직 없음). NoticeCard의 StatusBadge
// aria-label과 재고 표의 상태 열이 이 한글 라벨을 함께 재사용한다.
const STOCK_STATUS_LABEL = { OK: '정상', LOW: '재고 부족', OUT: '매진' };
const PRODUCT_TYPE_LABEL = { BREAD: '빵', DRINK: '음료' };

export default function InventoryPageContent() {
  const queryClient = useQueryClient();
  const [queryState, setQueryState] = useState(DEFAULT_INVENTORY_QUERY);
  // 재고 조정 모달이 다루는 상품 한 건. null이면 모달이 닫힌 상태다 —
  // 별도 open boolean을 두지 않고 이 값 하나로 열림/닫힘을 표현한다.
  // 긴급 보충 Chip과 재고 표 관리 열이 같은 상태와 같은 모달 인스턴스를
  // 공유한다.
  const [selectedInventoryItem, setSelectedInventoryItem] = useState(null);
  // 모달을 연 실제 button element를 기억해둔다. Dialog.Trigger를 쓰지
  // 않는 controlled 모달이라 Radix가 스스로 알 수 없는, "닫힌 뒤 포커스를
  // 되돌릴 곳"을 InventoryAdjustmentModal에 명시적으로 넘기기 위함이다.
  const adjustmentTriggerRef = useRef(null);

  // 재고 반영(PATCH) mutation. backend에 idempotency/동시성 방어가 없으므로
  // isPending 동안 버튼(disabled)과 이 아래 두 handler(open/submit) 양쪽
  // 모두에서 중복 제출·모달 전환을 막는다. 성공 시에는 응답 일부만으로
  // cache를 직접 patch하지 않고, Inventory namespace 전체를 invalidate해
  // 현재 목록과 긴급 보충(OUT/LOW)을 실제 GET으로 다시 조회한다 — 조정된
  // 상품이 서버 재판정으로 현재 필터/긴급 목록에서 사라지는 것도 정상
  // 동작으로 그대로 반영한다.
  const restockMutation = useMutation({
    mutationFn: ({ productId, qty }) =>
      restockInventoryProduct({ productId, qty }),
    onSuccess: () => {
      setSelectedInventoryItem(null);
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.all });
    },
  });

  function handleOpenAdjustmentModal(item, event) {
    // mutation 진행 중에는 다른 상품으로 모달을 전환하지 않는다.
    if (restockMutation.isPending) {
      return;
    }
    adjustmentTriggerRef.current = event.currentTarget;
    // 새 상품을 열 때 이전 상품의 mutation 실패 상태를 남겨두지 않는다.
    restockMutation.reset();
    setSelectedInventoryItem(item);
  }

  function handleAdjustmentModalOpenChange(nextOpen) {
    if (!nextOpen) {
      setSelectedInventoryItem(null);
      restockMutation.reset();
    }
  }

  function handleRestockSubmit({ productId, qty }) {
    if (restockMutation.isPending) {
      return;
    }
    restockMutation.mutate({ productId, qty });
  }

  // 네 필터 모두 규칙이 같다: 값 하나 바꾸고 page를 1로 되돌린다. 상태
  // 객체는 항상 새로 만들어서 교체하고 직접 mutate하지 않는다.
  function handleProductTypeChange(productType) {
    setQueryState((prev) => ({ ...prev, productType, page: 1 }));
  }

  function handleStockStatusChange(stockStatus) {
    setQueryState((prev) => ({ ...prev, stockStatus, page: 1 }));
  }

  function handleCategoryChange(category) {
    setQueryState((prev) => ({ ...prev, category, page: 1 }));
  }

  function handleQueryChange(event) {
    const query = event.target.value;
    setQueryState((prev) => ({ ...prev, query, page: 1 }));
  }

  // 재고 표 목록 query. normalizedQuery(=buildInventoryApiQuery 결과)를
  // queryKey에 그대로 실어 필터·검색·페이지 조합마다 별도로 캐시된다.
  // Foundation의 retry/refetchOnWindowFocus 기본 정책을 그대로 쓴다.
  const normalizedQuery = buildInventoryApiQuery(queryState);
  const inventoryListQuery = useQuery({
    queryKey: inventoryQueryKeys.list(normalizedQuery),
    queryFn: ({ signal }) => fetchInventoryList(queryState, { signal }),
  });
  const pageInfo = inventoryListQuery.isSuccess
    ? mapInventoryResponseToPageInfo(inventoryListQuery.data)
    : null;

  // "지금 채워야 할 빵" 긴급 보충 query. 상단 필터·검색·페이지(queryState)와
  // 완전히 독립된 별도 queryKey를 쓴다 — 매장 전체 기준으로 항상 같은
  // 대상을 보여줘야 하므로 재고 표 필터에 영향받지 않는다.
  const urgentRestockQuery = useQuery({
    queryKey: inventoryQueryKeys.urgentRestockBread,
    queryFn: ({ signal }) => fetchUrgentRestockBread({ signal }),
  });
  const urgentRestockBread = urgentRestockQuery.isSuccess
    ? mapInventoryResponsesToUrgentRestockBread(
        urgentRestockQuery.data.out,
        urgentRestockQuery.data.low
      )
    : null;

  // 이전/다음 버튼은 disabled 상태에서 호출되지 않지만, page 값 자체도
  // 1과 totalPages 밖으로 나가지 않도록 한 번 더 방어한다. 필터·검색은
  // 그대로 두고 page만 새 값으로 교체한다(기존 객체 mutate 없음).
  function handlePreviousPage() {
    setQueryState((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
  }

  function handleNextPage() {
    setQueryState((prev) => ({
      ...prev,
      page: Math.min(pageInfo?.totalPages ?? prev.page, prev.page + 1),
    }));
  }

  // 긴급 보충 "외 N개 더보기": queryState는 건드리지 않고(필터·재고 상태
  // 조건 변경 없음), URL hash도 바꾸지 않고 기존 TableCard id로 스크롤만
  // 한다. 요소가 아직 없을 극단적인 경우를 대비해 optional chaining으로
  // 감싼다.
  function handleScrollToInventoryTable() {
    document
      .getElementById('inventory-table')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className={dashboardLayoutStyles.page}>
      <PageHeader
        title="재고 관리"
        description="현재 재고는 판매 완료 시 자동 차감됩니다. 재고 조정은 점장이 직접 반영할 수 있습니다."
        className={styles.inventoryPageHeader}
        actions={
          <div className={styles.filters}>
            {/* 시각적 레이블은 각 SegmentedControl의 aria-label과 의미가
                겹치므로 스크린 리더에서는 감춘다(중복 방지). */}
            <span className={styles.filterGroupLabel} aria-hidden="true">
              구분
            </span>
            <SegmentedControl
              aria-label="상품 구분 필터"
              items={PRODUCT_TYPE_FILTER_OPTIONS}
              value={queryState.productType}
              onValueChange={handleProductTypeChange}
            />
            <span className={styles.filterDivider} aria-hidden="true" />
            <span className={styles.filterGroupLabel} aria-hidden="true">
              상태
            </span>
            <SegmentedControl
              aria-label="재고 상태 필터"
              items={STOCK_STATUS_FILTER_OPTIONS}
              value={queryState.stockStatus}
              onValueChange={handleStockStatusChange}
            />
            <SelectControl
              aria-label="세부 카테고리 필터"
              items={CATEGORY_FILTER_OPTIONS}
              value={queryState.category}
              onValueChange={handleCategoryChange}
            />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="상품명 검색"
              aria-label="상품명 검색"
              autoComplete="off"
              value={queryState.query}
              onChange={handleQueryChange}
            />
          </div>
        }
      />
      <div className={dashboardLayoutStyles.pageContent}>
        <div className={styles.contentStack}>
          {urgentRestockQuery.isPending ? (
            <p
              className={styles.urgentStatusMessage}
              role="status"
              aria-live="polite"
            >
              긴급 재고를 확인하는 중입니다.
            </p>
          ) : urgentRestockQuery.isError ? (
            <>
              <p className={styles.urgentStatusMessage} role="alert">
                긴급 재고를 불러오지 못했습니다.
              </p>
              <div className={styles.stateActions}>
                <Button onClick={() => urgentRestockQuery.refetch()}>
                  다시 시도
                </Button>
              </div>
            </>
          ) : urgentRestockBread && urgentRestockBread.total > 0 ? (
            <NoticeCard
              title="지금 채워야 할 빵"
              meta={
                <>
                  {`${urgentRestockBread.total}개`}
                  {urgentRestockBread.remainingCount > 0 ? (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className={styles.restockMore}
                        onClick={handleScrollToInventoryTable}
                        aria-label={`남은 긴급 재고 ${urgentRestockBread.remainingCount}개를 재고 목록에서 보기`}
                      >
                        {`외 ${urgentRestockBread.remainingCount}개 더보기`}
                      </button>
                    </>
                  ) : null}
                </>
              }
            >
              <ul className={styles.restockChips}>
                {urgentRestockBread.items.map((item) => (
                  <li key={item.product_id} className={styles.restockChip}>
                    <span className={styles.restockChipName}>
                      {item.product_name}
                    </span>
                    <StatusBadge
                      status={item.stock_status.toLowerCase()}
                      aria-label={`${STOCK_STATUS_LABEL[item.stock_status]}, 추정 재고 ${item.remaining_qty}개`}
                    >
                      {`추정 ${item.remaining_qty}개`}
                    </StatusBadge>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={restockMutation.isPending}
                      onClick={(event) =>
                        handleOpenAdjustmentModal(item, event)
                      }
                      aria-label={`${item.product_name} 재고 조정 열기`}
                    >
                      재고 조정
                    </Button>
                  </li>
                ))}
              </ul>
            </NoticeCard>
          ) : null}
          <TableCard id="inventory-table">
            {inventoryListQuery.isPending ? (
              <p className={styles.tableEmpty} role="status" aria-live="polite">
                재고 목록을 불러오는 중입니다.
              </p>
            ) : inventoryListQuery.isError ? (
              <>
                <p className={styles.tableEmpty} role="alert">
                  재고 목록을 불러오지 못했습니다.
                </p>
                <div className={styles.stateActions}>
                  <Button onClick={() => inventoryListQuery.refetch()}>
                    다시 시도
                  </Button>
                </div>
              </>
            ) : pageInfo.total === 0 ? (
              <p
                className={styles.tableEmpty}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                선택한 조건에 해당하는 상품이 없습니다.
              </p>
            ) : (
              <>
                <div
                  className={styles.tableWrapper}
                  tabIndex={0}
                  aria-label="재고 목록 표, 좌우로 스크롤 가능"
                >
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">상품</th>
                        <th scope="col">구분</th>
                        <th scope="col">초기/생산</th>
                        <th scope="col">판매</th>
                        <th scope="col">현재</th>
                        <th scope="col">재고율</th>
                        <th scope="col">상태</th>
                        <th scope="col">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageInfo.items.map((item) => {
                        const meterWidth = Math.min(
                          100,
                          Math.max(0, item.remaining_pct)
                        );

                        return (
                          <tr
                            key={item.product_id}
                            data-status={item.stock_status.toLowerCase()}
                          >
                            <td className={styles.productCell}>
                              <div
                                className={styles.productName}
                                title={item.product_name}
                              >
                                {item.product_name}
                              </div>
                              <div className={styles.productCategory}>
                                {item.category ?? '미분류'}
                              </div>
                            </td>
                            <td className={styles.nowrapCell}>
                              {PRODUCT_TYPE_LABEL[item.product_type]}
                            </td>
                            <td className={styles.nowrapCell}>
                              {`${item.produced_qty}개`}
                            </td>
                            <td className={styles.nowrapCell}>
                              {`${item.sold_qty}개`}
                            </td>
                            <td className={styles.nowrapCell}>
                              <span className={styles.remainingQty}>
                                {`추정 ${item.remaining_qty}개`}
                              </span>
                            </td>
                            <td>
                              <div className={styles.stockRate}>
                                <div
                                  className={styles.stockMeter}
                                  aria-hidden="true"
                                >
                                  <span
                                    className={styles.stockMeterFill}
                                    style={{ width: `${meterWidth}%` }}
                                  />
                                </div>
                                <span className={styles.stockRateText}>
                                  {`${Math.round(item.remaining_pct)}%`}
                                </span>
                              </div>
                            </td>
                            <td>
                              <StatusBadge
                                status={item.stock_status.toLowerCase()}
                              >
                                {STOCK_STATUS_LABEL[item.stock_status]}
                              </StatusBadge>
                            </td>
                            <td>
                              <Button
                                type="button"
                                variant="primary"
                                disabled={restockMutation.isPending}
                                onClick={(event) =>
                                  handleOpenAdjustmentModal(item, event)
                                }
                                aria-label={`${item.product_name} 재고 조정 열기`}
                              >
                                재고 조정
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <nav
                  className={styles.paginationFooter}
                  aria-label="재고 목록 페이지네이션"
                >
                  <span className={styles.paginationCount}>
                    {`총 ${pageInfo.total}개 중 ${pageInfo.rangeStart}-${pageInfo.rangeEnd}`}
                  </span>
                  <div className={styles.paginationNav}>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!pageInfo.hasPreviousPage}
                      onClick={handlePreviousPage}
                      aria-label="이전 재고 목록 페이지"
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
                      aria-label="다음 재고 목록 페이지"
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
      <InventoryAdjustmentModal
        item={selectedInventoryItem}
        open={selectedInventoryItem !== null}
        onOpenChange={handleAdjustmentModalOpenChange}
        returnFocusRef={adjustmentTriggerRef}
        onSubmit={handleRestockSubmit}
        isSubmitting={restockMutation.isPending}
        submitError={restockMutation.isError}
      />
    </section>
  );
}
