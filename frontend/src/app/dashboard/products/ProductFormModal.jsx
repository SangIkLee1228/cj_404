'use client';

import { useEffect, useId, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Image as ImagePlaceholderIcon, X } from 'lucide-react';
import SelectControl from '../components/ui/SelectControl';
import Button from '../components/ui/Button';
import themeStyles from '../styles/dashboard-theme.module.css';
import styles from './products.module.css';
import {
  BREAD_CATEGORY_OPTIONS,
  DRINK_CATEGORY_OPTIONS,
  SOURCE_TYPE_OPTIONS,
  buildProductCreatePayload,
  buildProductUpdatePayload,
} from './products-data';

// 상품 유형 선택지. Inventory의 필터 옵션과 달리 'ALL'이 없다 — 폼은 항상
// 구체적인 상품 유형 하나를 골라야 한다.
const PRODUCT_TYPE_FORM_OPTIONS = [
  { value: 'BREAD', label: '빵' },
  { value: 'DRINK', label: '음료' },
];

const CREATE_DEFAULTS = Object.freeze({
  productName: '',
  productType: 'BREAD',
  category: '간식빵',
  price: '2500',
  sourceType: 'IN_STORE',
  initialQty: '20',
});

function getCategoryOptions(productType) {
  return productType === 'DRINK'
    ? DRINK_CATEGORY_OPTIONS
    : BREAD_CATEGORY_OPTIONS;
}

// 상품 추가·수정 모달(Products 전용). InventoryAdjustmentModal.jsx의 구조
// (controlled Dialog, Dialog.Trigger 없이 트리거 button을 ref로 되돌려받는
// 방식, backend에 idempotency가 없어 반영 중 닫기를 막는 방식)만
// 참고했고, 그 파일을 직접 import하지 않는다 — Products와 Inventory는
// 완전히 독립된 조회·조정 계약을 갖는다.
//
// mode: 'create' | 'edit'
// item: edit일 때만 사용하는 ProductRead 형태의 상품(create에서는 null)
//
// mutation 자체(useMutation, invalidate, 성공 시 모달 닫기, 409 등 오류
// 문구 판정)는 부모(ProductsPageContent)가 소유한다. 이 컴포넌트는
// onSubmit/isSubmitting/submitError props로만 그 상태를 반영하고, 내부
// 에서 API를 호출하거나 cache를 직접 만지지 않는다. onSubmit은 검증을
// 통과한 snake_case payload(ProductCreate/ProductUpdate 계약과 동일한
// 필드만 포함) 하나만 인자로 받는다 — productId 결정은 부모가
// productFormState(선택된 item)로 처리한다.
export default function ProductFormModal({
  mode,
  item,
  open,
  onOpenChange,
  returnFocusRef,
  onSubmit,
  isSubmitting = false,
  submitError = null,
}) {
  const [productName, setProductName] = useState(CREATE_DEFAULTS.productName);
  const [productType, setProductType] = useState(CREATE_DEFAULTS.productType);
  const [category, setCategory] = useState(CREATE_DEFAULTS.category);
  const [price, setPrice] = useState(CREATE_DEFAULTS.price);
  const [sourceType, setSourceType] = useState(CREATE_DEFAULTS.sourceType);
  const [initialQty, setInitialQty] = useState(CREATE_DEFAULTS.initialQty);

  const nameFieldId = useId();
  const nameErrorId = useId();
  const typeLabelId = useId();
  const categoryLabelId = useId();
  const priceFieldId = useId();
  const priceErrorId = useId();
  const sourceLabelId = useId();
  const initialQtyFieldId = useId();
  const initialQtyErrorId = useId();

  const isCreate = mode === 'create';

  // 모달이 열릴 때(또는 열려 있는 채로 다른 상품/모드로 바뀔 때)마다 입력을
  // 다시 채운다. create는 항상 고정 기본값으로, edit은 선택된 item의 현재
  // 값으로 초기화한다 — 렌더링 중 setState를 호출하지 않도록 커밋 이후
  // 실행되는 effect에서만 처리한다.
  useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === 'edit' && item) {
      setProductName(item.product_name);
      setProductType(item.product_type);
      setCategory(
        item.category ?? getCategoryOptions(item.product_type)[0].value
      );
      setPrice(String(item.price));
      setSourceType(item.source_type);
      setInitialQty(CREATE_DEFAULTS.initialQty);
    } else {
      setProductName(CREATE_DEFAULTS.productName);
      setProductType(CREATE_DEFAULTS.productType);
      setCategory(CREATE_DEFAULTS.category);
      setPrice(CREATE_DEFAULTS.price);
      setSourceType(CREATE_DEFAULTS.sourceType);
      setInitialQty(CREATE_DEFAULTS.initialQty);
    }
  }, [open, mode, item]);

  // 유형이 바뀌면 카테고리 옵션 자체가 바뀐다. 현재 선택된 카테고리가 새
  // 유형에 속하지 않으면 그 유형의 첫 카테고리로 맞춘다.
  function handleProductTypeChange(nextType) {
    setProductType(nextType);
    setCategory((prevCategory) => {
      const options = getCategoryOptions(nextType);
      return options.some((option) => option.value === prevCategory)
        ? prevCategory
        : options[0].value;
    });
  }

  const categoryOptions = getCategoryOptions(productType);

  // 매 렌더링마다 현재 입력값을 실제 POST/PATCH payload 계약으로
  // 검증한다 — 이 컴포넌트에서 별도 검증 로직을 만들지 않고
  // products-data.js의 payload builder 결과(성공 여부 + 필드별 오류)만
  // 그대로 옮긴다. 유효하면 result.data가 곧 onSubmit에 넘길 payload다.
  const formValues = {
    productName,
    productType,
    category,
    price,
    sourceType,
    initialQty,
  };
  const payloadResult = isCreate
    ? buildProductCreatePayload(formValues)
    : buildProductUpdatePayload(formValues);
  const fieldErrors = payloadResult.success ? {} : payloadResult.fieldErrors;
  const isFormValid = payloadResult.success;

  // backend에 idempotency/동시성 방어가 없으므로, 저장 중에는 Escape/
  // Overlay/닫기 버튼으로 닫히지 않도록 컨트롤된 onOpenChange 자체에서
  // 닫기 요청을 삼킨다 — 부모의 open state가 바뀌지 않으면 controlled
  // Dialog.Root는 계속 열린 채로 남는다.
  function handleDialogOpenChange(nextOpen) {
    if (isSubmitting) {
      return;
    }
    onOpenChange(nextOpen);
  }

  // preventDefault 후 같은 검증(payloadResult)을 통과했을 때만, 그리고
  // 이미 저장 중이 아닐 때만 onSubmit을 정확히 한 번 호출한다 — 버튼
  // disabled와 이 handler 양쪽에서 중복 제출을 막는다.
  function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting || !payloadResult.success) {
      return;
    }
    onSubmit(payloadResult.data);
  }

  const modalTitle = isCreate
    ? '상품 추가'
    : `${item?.product_name ?? ''} 상품 수정`;
  const saveLabel = isSubmitting ? '저장 중…' : '저장';
  const saveAriaLabel = isSubmitting
    ? `${isCreate ? '새 상품' : (item?.product_name ?? '')} 저장 중`
    : `${isCreate ? '새 상품' : (item?.product_name ?? '')} 저장`;

  return (
    <Dialog.Root open={open} onOpenChange={handleDialogOpenChange}>
      <Dialog.Portal>
        {/* Portal은 body 바로 아래에 렌더링되어 Dashboard .theme 조상 밖에
            놓이므로, --dashboard-* 토큰이 상속되도록 Overlay·Content 둘 다
            여기서 theme 클래스를 다시 적용한다(토큰 파일 자체는 수정하지
            않음). */}
        <Dialog.Overlay
          className={`${styles.modalOverlay} ${themeStyles.theme}`}
        />
        <Dialog.Content
          className={`${styles.modalContent} ${themeStyles.theme}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const triggerButton = returnFocusRef?.current;
            if (triggerButton && triggerButton.isConnected) {
              triggerButton.focus();
            }
          }}
        >
          <div className={styles.modalHeader}>
            <Dialog.Title className={styles.modalTitle}>
              {modalTitle}
            </Dialog.Title>
            <Dialog.Close
              className={styles.modalClose}
              aria-label="닫기"
              disabled={isSubmitting}
            >
              <X aria-hidden="true" size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.visuallyHidden}>
            {isCreate
              ? '새 상품을 등록합니다. 저장 버튼을 누르면 실제 상품 목록에 즉시 반영됩니다.'
              : `${item?.product_name ?? ''}의 상품 정보를 수정합니다. 저장 버튼을 누르면 실제 정보에 즉시 반영됩니다.`}
          </Dialog.Description>
          <form
            className={styles.modalBody}
            onSubmit={handleSubmit}
            aria-busy={isSubmitting}
          >
            <div className={styles.modalImage} aria-hidden="true">
              <ImagePlaceholderIcon aria-hidden="true" />
            </div>
            <div className={styles.modalFields}>
              <div className={`${styles.modalField} ${styles.modalFieldFull}`}>
                <label htmlFor={nameFieldId} className={styles.modalFieldLabel}>
                  상품명
                </label>
                <input
                  id={nameFieldId}
                  type="text"
                  maxLength={100}
                  className={styles.modalTextInput}
                  value={productName}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.productName)}
                  aria-describedby={
                    fieldErrors.productName ? nameErrorId : undefined
                  }
                  onChange={(event) => setProductName(event.target.value)}
                />
                {fieldErrors.productName ? (
                  <p id={nameErrorId} className={styles.modalFieldError}>
                    상품명을 입력해주세요.
                  </p>
                ) : null}
              </div>
              <div className={styles.modalField}>
                <label id={typeLabelId} className={styles.modalFieldLabel}>
                  유형
                </label>
                <SelectControl
                  aria-labelledby={typeLabelId}
                  className={styles.modalSelectTrigger}
                  items={PRODUCT_TYPE_FORM_OPTIONS}
                  value={productType}
                  onValueChange={handleProductTypeChange}
                  disabled={isSubmitting}
                />
              </div>
              <div className={styles.modalField}>
                <label id={categoryLabelId} className={styles.modalFieldLabel}>
                  카테고리
                </label>
                <SelectControl
                  aria-labelledby={categoryLabelId}
                  className={styles.modalSelectTrigger}
                  items={categoryOptions}
                  value={category}
                  onValueChange={setCategory}
                  disabled={isSubmitting}
                />
              </div>
              <div className={`${styles.modalField} ${styles.modalFieldFull}`}>
                <label
                  htmlFor={priceFieldId}
                  className={styles.modalFieldLabel}
                >
                  판매가
                </label>
                <div className={styles.priceField}>
                  <input
                    id={priceFieldId}
                    type="number"
                    min="0"
                    step="1"
                    className={styles.modalNumberInput}
                    value={price}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(fieldErrors.price)}
                    aria-describedby={
                      fieldErrors.price ? priceErrorId : undefined
                    }
                    onChange={(event) => setPrice(event.target.value)}
                  />
                  <span className={styles.priceFieldSuffix}>원</span>
                </div>
                {fieldErrors.price ? (
                  <p id={priceErrorId} className={styles.modalFieldError}>
                    판매가는 0 이상의 정수로 입력해주세요.
                  </p>
                ) : null}
              </div>
              <div className={styles.modalField}>
                <label id={sourceLabelId} className={styles.modalFieldLabel}>
                  공급 유형
                </label>
                <SelectControl
                  aria-labelledby={sourceLabelId}
                  className={styles.modalSelectTrigger}
                  items={SOURCE_TYPE_OPTIONS}
                  value={sourceType}
                  onValueChange={setSourceType}
                  disabled={isSubmitting}
                />
              </div>
              {isCreate ? (
                <div className={styles.modalField}>
                  <label
                    htmlFor={initialQtyFieldId}
                    className={styles.modalFieldLabel}
                  >
                    초기 수량
                  </label>
                  <input
                    id={initialQtyFieldId}
                    type="number"
                    min="0"
                    step="1"
                    className={styles.modalNumberInput}
                    value={initialQty}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(fieldErrors.initialQty)}
                    aria-describedby={
                      fieldErrors.initialQty ? initialQtyErrorId : undefined
                    }
                    onChange={(event) => setInitialQty(event.target.value)}
                  />
                  {fieldErrors.initialQty ? (
                    <p
                      id={initialQtyErrorId}
                      className={styles.modalFieldError}
                    >
                      초기 수량은 0 이상의 정수로 입력해주세요.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {submitError ? (
                <p className={styles.modalSubmitError} role="alert">
                  {submitError}
                </p>
              ) : null}
            </div>
            <div className={styles.modalActions}>
              <Button
                type="submit"
                variant="primary"
                disabled={!isFormValid || isSubmitting}
                aria-label={saveAriaLabel}
              >
                {saveLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
