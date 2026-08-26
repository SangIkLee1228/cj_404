'use client';

import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import SelectControl from '../components/ui/SelectControl';
import dashboardLayoutStyles from '../dashboard-layout.module.css';
import styles from './inventory.module.css';
import { DEFAULT_INVENTORY_QUERY } from './inventory-data';
import {
  PRODUCT_TYPE_FILTER_OPTIONS,
  STOCK_STATUS_FILTER_OPTIONS,
  CATEGORY_FILTER_OPTIONS,
} from './inventory-mock-data';

// F1-4는 조회 상태(queryState)만 관리한다. queryMockInventoryList /
// mapInventoryResponseToPageInfo 호출과 그 결과를 실제로 화면에 그리는 일은
// F1-5(긴급 보충)·F1-6(재고 표·페이지네이션)의 몫이다 — 여기서 호출해봐야
// 아직 아무 데도 쓰이지 않는 값을 만들 뿐이라, queryState를 그 함수들에 바로
// 넘길 수 있는 형태로 정확히 준비해 두는 것까지만 이번 단계의 책임으로
// 둔다.
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

  return (
    <section className={dashboardLayoutStyles.page}>
      <PageHeader
        title="재고 관리"
        description="현재 재고는 판매 완료 시 자동 차감됩니다. 재고 조정은 점장이 직접 반영할 수 있습니다."
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
    </section>
  );
}
