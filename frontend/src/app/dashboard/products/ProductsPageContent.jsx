'use client';

import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import TableCard from '../components/ui/TableCard';
import ProductFormModal from './ProductFormModal';
import dashboardLayoutStyles from '../dashboard-layout.module.css';
import styles from './products.module.css';
import {
  DEFAULT_PRODUCTS_QUERY,
  queryMockProductsList,
  mapProductsResponseToPageInfo,
} from './products-data';
import { PRODUCT_TYPE_FILTER_OPTIONS } from './products-mock-data';

// API 응답의 product_type 값을 화면 표시용 한글 라벨로 매핑만 하는
// 상수(새 판정 로직 없음).
const PRODUCT_TYPE_LABEL = { BREAD: '빵', DRINK: '음료' };

// 판매가 표시용 포매터를 모듈 상수로 한 번만 만든다(렌더링마다 새로
// 만들지 않음).
const PRICE_FORMATTER = new Intl.NumberFormat('ko-KR');

// AI 클래스는 ProductRead API에 없는 필드다. 목업의 정보 구조만 유지하기
// 위해 화면 표시 시에만 상품명에서 파생하는 presentation-only helper다 —
// Mock item이나 응답 필드에는 이 값을 추가하지 않는다. 실제 API 연결 전에
// AI 클래스를 별도 엔드포인트로 받을지는 재검토가 필요하다.
function getAiClassLabel(item) {
  if (item.product_type !== 'BREAD') {
    return '-';
  }
  return item.product_name.replace(/\s+/g, '_');
}

// 빵 채움 기준: 목업의 고정 "5개 미만" 문구 대신 API 계약 필드
// (stock_baseline_pct)를 그대로 반영한다. DRINK이거나 기준값이 없으면
// "-"로 표시한다.
function getFillThresholdLabel(item) {
  if (item.product_type !== 'BREAD' || item.stock_baseline_pct == null) {
    return '-';
  }
  return `재고율 ${item.stock_baseline_pct}% 이하`;
}

export default function ProductsPageContent() {
  const [queryState, setQueryState] = useState(DEFAULT_PRODUCTS_QUERY);
  // 상품 추가·수정 모달이 다루는 대상. null이면 모달이 닫힌 상태다.
  // { mode: 'create', item: null } 또는 { mode: 'edit', item } 형태로만
  // 채운다 — 상단 "상품 추가" 버튼과 각 행의 "수정" 버튼이 같은 상태와
  // 같은 모달 인스턴스를 공유한다.
  const [productFormState, setProductFormState] = useState(null);
  // 모달을 연 실제 button element를 기억해둔다. Dialog.Trigger를 쓰지
  // 않는 controlled 모달이라 Radix가 스스로 알 수 없는, "닫힌 뒤 포커스를
  // 되돌릴 곳"을 ProductFormModal에 명시적으로 넘기기 위함이다.
  const productFormTriggerRef = useRef(null);

  function handleProductTypeChange(productType) {
    setQueryState((prev) => ({ ...prev, productType, page: 1 }));
  }

  // 41개 규모의 Mock 데이터를 매 렌더링마다 다시 조회해도 비용이 미미해
  // useMemo 없이 단순 계산으로 둔다. 컴포넌트에서 직접 filter/sort/slice를
  // 구현하지 않고, 두 함수의 반환값만 그대로 화면에 옮긴다.
  const productsResponse = queryMockProductsList(queryState);
  const pageInfo = mapProductsResponseToPageInfo(productsResponse);

  // 이전/다음 버튼은 disabled 상태에서 호출되지 않지만, page 값 자체도
  // 1과 totalPages 밖으로 나가지 않도록 한 번 더 방어한다.
  function handlePreviousPage() {
    setQueryState((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
  }

  function handleNextPage() {
    setQueryState((prev) => ({
      ...prev,
      page: Math.min(pageInfo.totalPages, prev.page + 1),
    }));
  }

  function handleOpenCreateProduct(event) {
    productFormTriggerRef.current = event.currentTarget;
    setProductFormState({ mode: 'create', item: null });
  }

  function handleOpenEditProduct(item, event) {
    productFormTriggerRef.current = event.currentTarget;
    setProductFormState({ mode: 'edit', item });
  }

  function handleProductFormOpenChange(nextOpen) {
    if (!nextOpen) {
      setProductFormState(null);
    }
  }

  return (
    <section className={dashboardLayoutStyles.page}>
      <PageHeader
        title="상품 마스터"
        description="상품명과 가격, 판매 상태를 관리합니다. 빵은 설정된 재고율 기준에 따라 채움 알림 대상이 됩니다."
        className={styles.productsPageHeader}
        actions={
          <div className={styles.filters}>
            {/* 시각적 레이블은 SegmentedControl의 aria-label과 의미가
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
            <Button
              type="button"
              variant="primary"
              leadingIcon={<Plus aria-hidden="true" />}
              onClick={handleOpenCreateProduct}
            >
              상품 추가
            </Button>
          </div>
        }
      />
      <div className={dashboardLayoutStyles.pageContent}>
        <TableCard>
          {pageInfo.total === 0 ? (
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
                aria-label="상품 목록 표, 좌우로 스크롤 가능"
              >
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">상품</th>
                      <th scope="col">유형</th>
                      <th scope="col">카테고리</th>
                      <th scope="col">판매가</th>
                      <th scope="col">AI 클래스</th>
                      <th scope="col">빵 채움 기준</th>
                      <th scope="col">판매</th>
                      <th scope="col">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageInfo.items.map((item) => (
                      <tr key={item.product_id}>
                        <td className={styles.productCell}>
                          <div
                            className={styles.productName}
                            title={item.product_name}
                          >
                            {item.product_name}
                          </div>
                        </td>
                        <td className={styles.nowrapCell}>
                          {PRODUCT_TYPE_LABEL[item.product_type]}
                        </td>
                        <td className={styles.nowrapCell}>
                          {item.category ?? '미분류'}
                        </td>
                        <td className={styles.nowrapCell}>
                          {`${PRICE_FORMATTER.format(item.price)}원`}
                        </td>
                        <td className={styles.nowrapCell}>
                          {getAiClassLabel(item)}
                        </td>
                        <td className={styles.nowrapCell}>
                          {getFillThresholdLabel(item)}
                        </td>
                        <td>
                          {/* status="out"은 재고 판정이 아니라 판매 중지
                              (is_active=false)의 시각적 표현으로만 쓴다. */}
                          <StatusBadge status={item.is_active ? 'ok' : 'out'}>
                            {item.is_active ? '판매중' : '중지'}
                          </StatusBadge>
                        </td>
                        <td>
                          <Button
                            type="button"
                            variant="primary"
                            onClick={(event) =>
                              handleOpenEditProduct(item, event)
                            }
                            aria-label={`${item.product_name} 수정 열기`}
                          >
                            수정
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <nav
                className={styles.paginationFooter}
                aria-label="상품 목록 페이지네이션"
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
                    aria-label="이전 상품 목록 페이지"
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
                    aria-label="다음 상품 목록 페이지"
                  >
                    다음
                  </Button>
                </div>
              </nav>
            </>
          )}
        </TableCard>
      </div>
      <ProductFormModal
        mode={productFormState?.mode ?? 'create'}
        item={productFormState?.item ?? null}
        open={productFormState !== null}
        onOpenChange={handleProductFormOpenChange}
        returnFocusRef={productFormTriggerRef}
      />
    </section>
  );
}
