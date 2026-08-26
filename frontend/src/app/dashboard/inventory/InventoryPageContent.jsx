'use client';

import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import SelectControl from '../components/ui/SelectControl';
import NoticeCard from '../components/ui/NoticeCard';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import TableCard from '../components/ui/TableCard';
import dashboardLayoutStyles from '../dashboard-layout.module.css';
import styles from './inventory.module.css';
import {
  DEFAULT_INVENTORY_QUERY,
  getUrgentRestockBread,
  queryMockInventoryList,
  mapInventoryResponseToPageInfo,
} from './inventory-data';
import {
  PRODUCT_TYPE_FILTER_OPTIONS,
  STOCK_STATUS_FILTER_OPTIONS,
  CATEGORY_FILTER_OPTIONS,
  INVENTORY_MOCK_RESPONSE,
} from './inventory-mock-data';

// F1-4는 조회 상태(queryState)만 관리했다. F1-6A부터는 이 queryState를
// queryMockInventoryList → mapInventoryResponseToPageInfo로 그대로 이어
// 현재 페이지 재고 표를 렌더링한다(이전/다음 버튼과 페이지 요약 문구는
// F1-6B의 몫).

// "지금 채워야 할 빵" 긴급 보충 영역은 상단 필터와 무관하게 매장 전체
// 기준으로 항상 같은 대상을 보여줘야 한다(inventory-data.js의 데이터 계약
// 참고: 페이지네이션된 response.items가 아니라 전체 Mock 데이터를 넘겨야
// 함). 필터 상태(queryState)에 의존하지 않는 정적인 값이라 컴포넌트 state로
// 두지 않고, import 시점에 한 번만 계산되는 모듈 상수로 둔다.
const URGENT_RESTOCK_BREAD = getUrgentRestockBread(
  INVENTORY_MOCK_RESPONSE.items
);

// API 응답의 stock_status/product_type 값을 화면 표시용 한글 라벨로
// 매핑만 하는 상수(새 판정 로직 없음). NoticeCard의 StatusBadge
// aria-label과 재고 표의 상태 열이 이 한글 라벨을 함께 재사용한다.
const STOCK_STATUS_LABEL = { OK: '정상', LOW: '재고 부족', OUT: '매진' };
const PRODUCT_TYPE_LABEL = { BREAD: '빵', DRINK: '음료' };

export default function InventoryPageContent() {
  const [queryState, setQueryState] = useState(DEFAULT_INVENTORY_QUERY);

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

  // 30개 규모의 Mock 데이터를 매 렌더링마다 다시 조회해도 비용이 미미해
  // useMemo 없이 단순 계산으로 둔다. 컴포넌트에서 직접 filter/sort/slice를
  // 구현하지 않고, 두 함수의 반환값만 그대로 화면에 옮긴다.
  const inventoryResponse = queryMockInventoryList(queryState);
  const pageInfo = mapInventoryResponseToPageInfo(inventoryResponse);

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
          {URGENT_RESTOCK_BREAD.total > 0 ? (
            <NoticeCard
              title="지금 채워야 할 빵"
              meta={
                <>
                  {`${URGENT_RESTOCK_BREAD.total}개`}
                  {URGENT_RESTOCK_BREAD.remainingCount > 0 ? (
                    <span className={styles.restockMore}>
                      {` · 외 ${URGENT_RESTOCK_BREAD.remainingCount}개 더보기`}
                    </span>
                  ) : null}
                </>
              }
            >
              <ul className={styles.restockChips}>
                {URGENT_RESTOCK_BREAD.items.map((item) => (
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
                      disabled
                      title="재고 조정 기능 준비 중"
                      aria-label={`${item.product_name} 재고 조정 기능 준비 중`}
                    >
                      재고 조정
                    </Button>
                  </li>
                ))}
              </ul>
            </NoticeCard>
          ) : null}
          <TableCard id="inventory-table">
            {pageInfo.total === 0 ? (
              <p className={styles.tableEmpty}>
                선택한 조건에 해당하는 상품이 없습니다.
              </p>
            ) : (
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
                              disabled
                              title="재고 조정 기능 준비 중"
                              aria-label={`${item.product_name} 재고 조정 기능 준비 중`}
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
            )}
          </TableCard>
        </div>
      </div>
    </section>
  );
}
