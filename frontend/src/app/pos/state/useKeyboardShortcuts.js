'use client';

import { useEffect } from 'react';

/**
 * pos.md 키보드 단축키(Space=촬영, Enter=결제 진입, Delete=삭제, Esc=취소) 지원.
 * 파괴적 조작(계산 취소/다시 촬영)에는 단축키를 배정하지 않는다 — Esc는 열린
 * 모달을 닫을 뿐, 계산 취소 자체를 실행하지 않는다.
 *
 * Space/Enter는 어떤 요소에도 포커스가 없을 때(document.body)만 반응한다 —
 * 버튼에 포커스가 있으면 브라우저 기본 동작(해당 버튼의 클릭)과 중복 실행되지
 * 않도록 하기 위함이다. Delete는 반대로, 계산 목록 행 안의 컨트롤에 포커스가
 * 있을 때만 그 항목을 대상으로 동작한다(현재 포커스=선택 개념).
 */
export function useKeyboardShortcuts({
  screen,
  isShooting,
  cartEmpty,
  paid,
  anyModalOpen,
  shoot,
  openBasicCapture,
  removeItem,
  openPaymentConfirm,
  closeTopModal,
}) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.repeat) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable)
        return;

      if (e.key === 'Escape') {
        if (anyModalOpen) {
          closeTopModal();
          e.preventDefault();
        }
        return;
      }

      // 모달이 열려 있는 동안에는 그 외 단축키를 비활성화한다.
      if (anyModalOpen) return;

      if (e.key === ' ' && e.target === document.body) {
        if (screen === 'shooting') {
          if (!isShooting) shoot();
        } else if (screen === 'recognition' && !paid) {
          openBasicCapture();
        }
        e.preventDefault();
        return;
      }

      if (e.key === 'Enter' && e.target === document.body) {
        if (screen === 'recognition' && !paid && !cartEmpty) {
          openPaymentConfirm();
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'Delete') {
        if (screen !== 'recognition' || paid) return;
        const row = document.activeElement?.closest('[data-cart-item]');
        if (!row) return;
        const name = row.getAttribute('data-cart-item');
        if (name) {
          removeItem(name);
          e.preventDefault();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    screen,
    isShooting,
    cartEmpty,
    paid,
    anyModalOpen,
    shoot,
    openBasicCapture,
    removeItem,
    openPaymentConfirm,
    closeTopModal,
  ]);
}
