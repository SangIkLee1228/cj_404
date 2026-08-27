'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  PRODUCT_TYPE_FILTER_OPTIONS,
  buildProductsApiQuery,
  mapProductsResponseToPageInfo,
} from './products-data';
import {
  productsQueryKeys,
  fetchProductsList,
  createProduct,
  updateProduct,
} from '../api/products-api';
import { DashboardApiError } from '../api/dashboard-api';

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
  const queryClient = useQueryClient();
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

  // 상품 추가·수정(POST/PATCH) mutation. backend에 idempotency/동시성
  // 방어가 없으므로 isPending 동안 버튼(disabled)과 아래 handler들
  // 양쪽 모두에서 중복 제출·모달 전환을 막는다. 성공 시에는 응답만으로
  // cache를 직접 patch하지 않고, Products namespace 전체를 invalidate해
  // 현재 필터/페이지 목록을 실제 GET으로 다시 조회한다 — 상품 유형이
  // 바뀌어 현재 필터에서 벗어나면 목록에서 자연스럽게 사라지는 것도
  // 정상 동작으로 그대로 반영한다.
  const productMutation = useMutation({
    mutationFn: (payload) =>
      productFormState?.mode === 'edit'
        ? updateProduct(productFormState.item.product_id, payload)
        : createProduct(payload),
    onSuccess: () => {
      setProductFormState(null);
      queryClient.invalidateQueries({ queryKey: productsQueryKeys.all });
    },
  });

  // 409(중복 상품명)만 구체적으로 안내하고, 그 외 실패는 공통 문구로
  // 안전하게 표시한다 — 서버 원문은 노출하지 않는다.
  const productSubmitErrorMessage = productMutation.isError
    ? productMutation.error instanceof DashboardApiError &&
      productMutation.error.status === 409
      ? '이미 등록된 상품명입니다. 다른 상품명을 입력해주세요.'
      : '상품 저장에 실패했습니다. 다시 시도해주세요.'
    : null;

  function handleProductTypeChange(productType) {
    setQueryState((prev) => ({ ...prev, productType, page: 1 }));
  }

  // 상품 목록 query. normalizedQuery(=buildProductsApiQuery 결과)를
  // queryKey에 그대로 실어 상품 유형·페이지 조합마다 별도로 캐시된다.
  // Foundation의 retry/refetchOnWindowFocus 기본 정책을 그대로 쓴다.
  const normalizedQuery = buildProductsApiQuery(queryState);
  const productsQuery = useQuery({
    queryKey: productsQueryKeys.list(normalizedQuery),
    queryFn: ({ signal }) => fetchProductsList(queryState, { signal }),
  });
  const pageInfo = productsQuery.isSuccess
    ? mapProductsResponseToPageInfo(productsQuery.data)
    : null;

  // 이전/다음 버튼은 disabled 상태에서 호출되지 않지만, page 값 자체도
  // 1과 totalPages 밖으로 나가지 않도록 한 번 더 방어한다.
  function handlePreviousPage() {
    setQueryState((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
  }

  function handleNextPage() {
    setQueryState((prev) => ({
      ...prev,
      page: Math.min(pageInfo?.totalPages ?? prev.page, prev.page + 1),
    }));
  }

  function handleOpenCreateProduct(event) {
    // mutation 진행 중에는 다른 모달로 전환하지 않는다.
    if (productMutation.isPending) {
      return;
    }
    productFormTriggerRef.current = event.currentTarget;
    // 새 모달을 열 때 이전 상품의 mutation 실패 상태를 남겨두지 않는다.
    productMutation.reset();
    setProductFormState({ mode: 'create', item: null });
  }

  function handleOpenEditProduct(item, event) {
    if (productMutation.isPending) {
      return;
    }
    productFormTriggerRef.current = event.currentTarget;
    productMutation.reset();
    setProductFormState({ mode: 'edit', item });
  }

  function handleProductFormOpenChange(nextOpen) {
    if (!nextOpen) {
      setProductFormState(null);
      productMutation.reset();
    }
  }

  function handleProductFormSubmit(payload) {
    if (productMutation.isPending) {
      return;
    }
    productMutation.mutate(payload);
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
              disabled={productMutation.isPending}
              onClick={handleOpenCreateProduct}
            >
              상품 추가
            </Button>
          </div>
        }
      />
      <div className={dashboardLayoutStyles.pageContent}>
        <TableCard>
          {productsQuery.isPending ? (
            <p
              className={styles.tableEmpty}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              상품 목록을 불러오는 중입니다.
            </p>
          ) : productsQuery.isError ? (
            <>
              <p className={styles.tableEmpty} role="alert">
                상품 목록을 불러오지 못했습니다.
              </p>
              <div className={styles.stateActions}>
                <Button onClick={() => productsQuery.refetch()}>
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
                            disabled={productMutation.isPending}
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
        onSubmit={handleProductFormSubmit}
        isSubmitting={productMutation.isPending}
        submitError={productSubmitErrorMessage}
      />
    </section>
  );
}
