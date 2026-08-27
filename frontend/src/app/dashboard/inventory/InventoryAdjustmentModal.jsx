'use client';

import { useEffect, useId, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Image as ImagePlaceholderIcon, X } from 'lucide-react';
import Button from '../components/ui/Button';
import themeStyles from '../styles/dashboard-theme.module.css';
import styles from './inventory.module.css';

// 백엔드 PATCH /api/inventory/{product_id}/restock 계약(request body는
// { qty: int }, 1~999 정수만 유효)에 맞춘 유효성 검사. 이 파일 전용이라
// export하지 않는다. 빈 문자열·정수가 아닌 값·범위 밖 값은 모두 "아직
// 유효한 수량이 아님"으로 취급해 null을 반환한다.
function parseValidQuantity(rawValue) {
  if (rawValue === '') {
    return null;
  }
  const numeric = Number(rawValue);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 999) {
    return null;
  }
  return numeric;
}

// 백엔드 restock 계약과 동일한 단일 규칙: remaining_qty = 기존
// remaining_qty + qty. 유효한 수량이 없으면(빈 값·범위 밖·소수 등) 현재
// 재고를 그대로 보여준다. 이 계산은 화면 미리보기일 뿐 실제 Mock 데이터를
// 변경하지 않는다.
function calculatePreviewQuantity(currentQty, quantityInput) {
  const validQty = parseValidQuantity(quantityInput);
  return validQty === null ? currentQty : currentQty + validQty;
}

// Inventory 재고 조정 모달(실제 PATCH /api/inventory/{product_id}/restock
// 연결). 긴급 보충 Chip과 재고 표 관리 열이 같은 이 컴포넌트 하나를
// 공유한다 — item/open/onOpenChange로 완전히 제어되며(controlled),
// Dialog.Trigger는 쓰지 않는다(두 버튼이 이 모달과 DOM 트리상 서로
// 떨어져 있는 위치에서 열어야 하므로). Trigger가 없어 Radix가 "어디서
// 열렸는지"를 스스로 알 수 없으므로, 닫힌 뒤 포커스를 되돌릴 button을
// returnFocusRef로 넘겨받는다(수동 focus trap이나 keydown 리스너는 만들지
// 않음 — 포커스 트랩은 계속 Radix Dialog에 맡긴다).
//
// mutation 자체(useMutation, invalidate, 성공 시 모달 닫기)는 부모
// (InventoryPageContent)가 소유한다. 이 컴포넌트는 onSubmit/isSubmitting/
// submitError props로만 그 상태를 반영하고, 내부에서 cache나 mutation
// 인스턴스를 직접 만들지 않는다.
export default function InventoryAdjustmentModal({
  item,
  open,
  onOpenChange,
  returnFocusRef,
  onSubmit,
  isSubmitting = false,
  submitError = null,
}) {
  const [quantityInput, setQuantityInput] = useState('10');
  const quantityFieldId = useId();
  const currentStockFieldId = useId();
  const quantityErrorId = useId();

  // 모달이 열릴 때(또는 열려 있는 채로 다른 상품으로 바뀔 때)마다 입력을
  // 기본값(10)으로 되돌린다. 렌더링 중 setState를 호출하지 않도록 커밋
  // 이후 실행되는 effect에서만 처리한다.
  useEffect(() => {
    if (open) {
      setQuantityInput('10');
    }
  }, [open, item]);

  const currentQty = item?.remaining_qty ?? 0;
  const parsedQty = parseValidQuantity(quantityInput);
  const isQuantityValid = parsedQty !== null;
  const previewQty = calculatePreviewQuantity(currentQty, quantityInput);

  // backend에 idempotency/동시성 방어가 없으므로, 반영 중에는 Escape/
  // Overlay/닫기 버튼으로 닫히지 않도록 컨트롤된 onOpenChange 자체에서
  // 닫기 요청을 삼킨다 — 부모의 open state가 바뀌지 않으면 controlled
  // Dialog.Root는 계속 열린 채로 남는다.
  function handleDialogOpenChange(nextOpen) {
    if (isSubmitting) {
      return;
    }
    onOpenChange(nextOpen);
  }

  // preventDefault 후 같은 유효성 검사(parseValidQuantity)를 통과했을
  // 때만, 그리고 이미 반영 중이 아닐 때만 onSubmit을 정확히 한 번
  // 호출한다 — 버튼 disabled와 이 handler 양쪽에서 중복 제출을 막는다.
  function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting || !item || parsedQty === null) {
      return;
    }
    onSubmit({ productId: item.product_id, qty: parsedQty });
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleDialogOpenChange}>
      <Dialog.Portal>
        {/* Portal은 body 바로 아래에 렌더링되어 Dashboard .theme 조상 밖에
            놓이므로, --dashboard-* 토큰이 상속되도록 Overlay·Content 둘 다
            여기서 theme 클래스를 다시 적용한다(토큰 파일 자체는 수정하지
            않음). modalOverlay는 --dashboard-color-text-primary를 쓰므로
            Overlay 쪽도 빠지면 안 된다. */}
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
          {item ? (
            <>
              <div className={styles.modalHeader}>
                <Dialog.Title className={styles.modalTitle}>
                  {`${item.product_name} 재고 조정`}
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
                {`${item.product_name}의 재고를 조정합니다. 반영 버튼을 누르면 실제 재고에 즉시 반영됩니다.`}
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
                  <div className={styles.modalField}>
                    <label
                      htmlFor={currentStockFieldId}
                      className={styles.modalFieldLabel}
                    >
                      현재 재고
                    </label>
                    <input
                      id={currentStockFieldId}
                      type="text"
                      className={styles.modalReadonlyInput}
                      value={`추정 ${currentQty}개`}
                      disabled
                      readOnly
                    />
                  </div>
                  <div className={styles.modalField}>
                    <label
                      htmlFor={quantityFieldId}
                      className={styles.modalFieldLabel}
                    >
                      추가 수량
                    </label>
                    <input
                      id={quantityFieldId}
                      type="number"
                      min="1"
                      max="999"
                      step="1"
                      className={styles.modalNumberInput}
                      value={quantityInput}
                      disabled={isSubmitting}
                      aria-invalid={!isQuantityValid}
                      aria-describedby={
                        !isQuantityValid ? quantityErrorId : undefined
                      }
                      onChange={(event) => setQuantityInput(event.target.value)}
                    />
                    {!isQuantityValid ? (
                      <p
                        id={quantityErrorId}
                        className={styles.modalFieldError}
                      >
                        1~999 사이의 정수를 입력하세요.
                      </p>
                    ) : null}
                  </div>
                  <div className={styles.adjustPreview}>
                    변경 후 재고{' '}
                    <span className={styles.adjustPreviewValue}>
                      {`추정 ${previewQty}개`}
                    </span>
                  </div>
                  {submitError ? (
                    <p className={styles.modalSubmitError} role="alert">
                      재고 반영에 실패했습니다. 다시 시도해주세요.
                    </p>
                  ) : null}
                </div>
                <div className={styles.modalActions}>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!isQuantityValid || isSubmitting}
                    aria-label={
                      isSubmitting
                        ? `${item.product_name} 재고 반영 중`
                        : `${item.product_name} 재고 반영`
                    }
                  >
                    {isSubmitting ? '반영 중…' : '재고 반영'}
                  </Button>
                </div>
              </form>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
