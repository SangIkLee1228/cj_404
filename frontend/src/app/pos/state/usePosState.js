'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  MOCK_ADD_CAPTURE,
  MOCK_BASIC_CAPTURE,
  MOCK_INVENTORY_BY_NAME,
  MOCK_RETAKE_CAPTURE,
  MOCK_SOLD_TODAY_BY_NAME,
  MOCK_UNREGISTERED_PHONE,
  findProductByName,
} from '../mock-data/mockProducts';
import { resolveRemaining } from '../sync/posSync';
import { usePosSync } from '../sync/usePosSync';
import { computePoints } from '../helpers/formatters';

const MEMBER_NAME = '정우현';

const initialState = {
  cart: [], // { name, price, qty, source: 'ai'|'manual'|'mixed', confidence, emoji, productId, belowThreshold }
  capture: {
    hasCaptured: false,
    mode: 'basic',
    screen: 'recognition',
    scanStartedAt: null,
  }, // screen: 'recognition' | 'shooting'
  membership: {
    phone: '010',
    memberConfirmed: false,
    phoneOverlayOpen: false,
    lookupFailed: false,
  },
  payment: { paid: false, failed: false },
  catalogFilter: { productType: 'bread', category: '전체' },
  inventoryOverrides: {}, // name -> remainingQty (대시보드 동기화가 없을 때만 쓰는 로컬 폴백)
  managerState: null, // 점장 대시보드 동기화 상태(sync adapter가 채워 넣는다)
  correctionCount: 0,
};

function cartQtyByName(cart, name) {
  const found = cart.find((item) => item.name === name);
  return found ? found.qty : 0;
}

/** incoming 항목을 base에 재고 한도 내에서 병합한다. 동일 상품이면 행을 새로 만들지 않고 수량만 합산한다. */
function mergeWithStockLimit(base, incoming, managerState, inventoryOverrides) {
  const out = base.map((item) => ({ ...item }));
  const skipped = [];

  incoming.forEach((item) => {
    const remaining = resolveRemaining(
      managerState,
      inventoryOverrides,
      item.name
    );
    const existing = out.find((x) => x.name === item.name);
    const current = existing ? existing.qty : 0;
    const allowed =
      remaining === Infinity ? item.qty : Math.max(0, remaining - current);
    const addQty = Math.min(item.qty, allowed);

    if (addQty <= 0) {
      skipped.push(item.name);
      return;
    }
    if (existing) {
      existing.qty += addQty;
      if (existing.source !== item.source) existing.source = 'mixed';
      existing.confidence = Math.max(
        existing.confidence || 0,
        item.confidence || 0
      );
    } else {
      out.push({
        ...item,
        qty: addQty,
        productId: findProductByName(item.name)?.productId,
      });
    }
    if (addQty < item.qty) skipped.push(item.name);
  });

  return { items: out, skipped: [...new Set(skipped)] };
}

const CAPTURE_MOCKS = {
  basic: MOCK_BASIC_CAPTURE,
  add: MOCK_ADD_CAPTURE,
  retake: MOCK_RETAKE_CAPTURE,
};

function resetMembershipFields(state) {
  return {
    ...state.membership,
    phone: '010',
    memberConfirmed: false,
    phoneOverlayOpen: false,
    lookupFailed: false,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_MANAGER_STATE':
      return { ...state, managerState: action.managerState };

    case 'CHANGE_QTY': {
      const { name, delta } = action;
      const item = state.cart.find((x) => x.name === name);
      if (!item) return state;

      if (delta > 0) {
        const remaining = resolveRemaining(
          state.managerState,
          state.inventoryOverrides,
          name
        );
        if (remaining !== Infinity && item.qty + delta > remaining) {
          return { ...state, _stockWarning: { name, remaining } };
        }
      }

      const nextQty = Math.max(0, item.qty + delta);
      const cart =
        nextQty === 0
          ? state.cart.filter((x) => x.name !== name)
          : state.cart.map((x) =>
              x.name === name ? { ...x, qty: nextQty } : x
            );

      return {
        ...state,
        cart,
        _stockWarning: null,
        correctionCount: state.correctionCount + 1,
      };
    }

    case 'MANUAL_ADD': {
      const { name } = action;
      const product = findProductByName(name);
      if (!product) return state;

      const remaining = resolveRemaining(
        state.managerState,
        state.inventoryOverrides,
        name
      );
      const current = cartQtyByName(state.cart, name);
      if (remaining !== Infinity && current + 1 > remaining) {
        return { ...state, _stockWarning: { name, remaining } };
      }

      const existing = state.cart.find((x) => x.name === name);
      const cart = existing
        ? state.cart.map((x) =>
            x.name === name ? { ...x, qty: x.qty + 1 } : x
          )
        : [
            ...state.cart,
            {
              name: product.name,
              price: product.price,
              emoji: product.emoji,
              category: product.category,
              productId: product.productId,
              qty: 1,
              confidence: null,
              source: 'manual',
            },
          ];

      return {
        ...state,
        cart,
        _stockWarning: null,
        _lastAdded: product.name,
        correctionCount: state.correctionCount + 1,
      };
    }

    case 'APPLY_CAPTURE': {
      const { mode } = action;
      const mockItems = CAPTURE_MOCKS[mode].map((x) => ({ ...x }));
      const manualKept = state.cart.filter((x) => x.source === 'manual');
      const base = mode === 'add' ? state.cart : manualKept;

      const { items, skipped } = mergeWithStockLimit(
        base,
        mockItems,
        state.managerState,
        state.inventoryOverrides
      );

      return {
        ...state,
        cart: items,
        capture: { ...state.capture, hasCaptured: true, screen: 'recognition' },
        membership: resetMembershipFields(state),
        _captureSkipped: skipped,
      };
    }

    case 'OPEN_CAPTURE_SCREEN': {
      if (state.payment.paid) return state;
      return {
        ...state,
        capture: {
          ...state.capture,
          mode: action.mode,
          screen: 'shooting',
          scanStartedAt:
            state.capture.scanStartedAt || new Date().toISOString(),
        },
      };
    }

    case 'CLOSE_CAPTURE_SCREEN':
      return { ...state, capture: { ...state.capture, screen: 'recognition' } };

    case 'CANCEL_ORDER': {
      if (state.payment.paid || state.cart.length === 0) return state;
      return {
        ...state,
        cart: [],
        capture: {
          hasCaptured: false,
          mode: 'basic',
          screen: 'recognition',
          scanStartedAt: null,
        },
        membership: resetMembershipFields(state),
        payment: { paid: false, failed: false },
        correctionCount: 0,
      };
    }

    case 'OPEN_MEMBERSHIP': {
      if (
        state.cart.length === 0 ||
        state.payment.paid ||
        state.membership.memberConfirmed
      )
        return state;
      return {
        ...state,
        membership: {
          ...state.membership,
          phone: '010',
          phoneOverlayOpen: true,
        },
      };
    }

    case 'PHONE_KEY': {
      const { key } = action;
      let { phone } = state.membership;
      if (key === 'back') {
        phone = phone.length > 3 ? phone.slice(0, -1) : phone;
      } else if (phone.length < 11) {
        phone += key;
      }
      return {
        ...state,
        membership: { ...state.membership, phone, lookupFailed: false },
      };
    }

    case 'CANCEL_PHONE':
      return {
        ...state,
        membership: {
          ...state.membership,
          phoneOverlayOpen: false,
          lookupFailed: false,
          phone: '010',
        },
      };

    case 'CONFIRM_PHONE': {
      if (state.membership.phone.length !== 11) return state;
      // 미등록 회원(Mock) — 조회 실패와 미입력/건너뛰기(정상 경로)를 구분한다.
      if (state.membership.phone === MOCK_UNREGISTERED_PHONE) {
        return {
          ...state,
          membership: { ...state.membership, lookupFailed: true, phone: '010' },
        };
      }
      return {
        ...state,
        membership: {
          ...state.membership,
          memberConfirmed: true,
          phoneOverlayOpen: false,
          lookupFailed: false,
        },
      };
    }

    case 'PAY': {
      if (state.cart.length === 0 || state.payment.paid) return state;

      const insufficient = state.cart.filter((item) => {
        const remaining = resolveRemaining(
          state.managerState,
          state.inventoryOverrides,
          item.name
        );
        return remaining !== Infinity && item.qty > remaining;
      });
      if (insufficient.length > 0) {
        return {
          ...state,
          _stockWarning: { names: insufficient.map((x) => x.name) },
        };
      }

      // 대시보드 동기화가 없는 독립 실행(로컬 폴백)에서도 재고가 줄어들도록 유지한다.
      const inventoryOverrides = { ...state.inventoryOverrides };
      state.cart.forEach((item) => {
        if (item.name in MOCK_INVENTORY_BY_NAME) {
          const remaining = resolveRemaining(
            null,
            inventoryOverrides,
            item.name
          );
          inventoryOverrides[item.name] = Math.max(0, remaining - item.qty);
        }
      });

      const totalAmount = state.cart.reduce(
        (sum, item) => sum + item.qty * item.price,
        0
      );
      return {
        ...state,
        inventoryOverrides,
        payment: { paid: true, failed: false },
        _stockWarning: null,
        _pendingOrder: {
          cartItems: state.cart.map((item) => ({ ...item })),
          member: state.membership.memberConfirmed,
          points: computePoints(totalAmount),
          hasCaptured: state.capture.hasCaptured,
          correctionCount: state.correctionCount,
          scanStartedAt: state.capture.scanStartedAt,
        },
      };
    }

    case 'CLEAR_PENDING_ORDER':
      return { ...state, _pendingOrder: null };

    // 결제망 미연동 상태에서 실패 UI/복구 흐름을 검증하기 위한 결정론적 테스트 전용
    // 경로. 정상 사용자 결제 경로에서는 절대 자동 호출되지 않는다 — window 전역
    // 훅(dev 빌드에서만 노출)을 통해 브라우저 테스트가 명시적으로 호출할 때만 실행된다.
    case 'DEV_FORCE_PAYMENT_FAILURE': {
      if (state.cart.length === 0 || state.payment.paid) return state;
      return { ...state, payment: { paid: false, failed: true } };
    }

    case 'NEW_ORDER':
      return {
        ...state,
        cart: [],
        capture: {
          hasCaptured: false,
          mode: 'basic',
          screen: 'recognition',
          scanStartedAt: null,
        },
        membership: resetMembershipFields(state),
        payment: { paid: false, failed: false },
        correctionCount: 0,
      };

    case 'SET_CATALOG_TYPE':
      return {
        ...state,
        catalogFilter: { productType: action.productType, category: '전체' },
      };

    case 'SET_CATALOG_CATEGORY':
      return {
        ...state,
        catalogFilter: { ...state.catalogFilter, category: action.category },
      };

    case 'CLEAR_STOCK_WARNING':
      return { ...state, _stockWarning: null };

    case 'CLEAR_CAPTURE_SKIPPED':
      return { ...state, _captureSkipped: null };

    case 'CLEAR_LAST_ADDED':
      return { ...state, _lastAdded: null };

    default:
      return state;
  }
}

export function usePosState() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const posSync = usePosSync();

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const activeCart = state.cart.filter((item) => item.qty > 0);
  const totalCount = activeCart.reduce((sum, item) => sum + item.qty, 0);
  const totalAmount = activeCart.reduce(
    (sum, item) => sum + item.qty * item.price,
    0
  );
  const points = computePoints(totalAmount);

  // 대시보드 동기화 상태를 리듀서로 흘려보낸다 — 이후 모든 재고/카탈로그 판단은 리듀서 안에서 일관되게 처리된다.
  useEffect(() => {
    dispatch({ type: 'SET_MANAGER_STATE', managerState: posSync.managerState });
  }, [posSync.managerState]);

  useEffect(() => {
    posSync.setScreen(
      state.payment.paid ? 'PAID' : activeCart.length > 0 ? 'ACTIVE' : 'READY'
    );
  });

  // 결제 완료 시 커밋할 주문이 쌓이면 sync adapter를 통해 대시보드 쪽 공유 상태에 반영한다.
  useEffect(() => {
    if (!state._pendingOrder) return;
    posSync.commitOrder(state._pendingOrder);
    dispatch({ type: 'CLEAR_PENDING_ORDER' });
  }, [state._pendingOrder, posSync]);

  // 결제 실패 UI/복구 흐름을 브라우저 테스트에서 결정론적으로 재현하기 위한 훅.
  // 프로덕션 빌드에는 포함하지 않는다 — 정상 결제 경로에는 어떤 영향도 주지 않는다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV === 'production') return;
    window.__posForcePaymentFailure = () =>
      dispatch({ type: 'DEV_FORCE_PAYMENT_FAILURE' });
    return () => {
      delete window.__posForcePaymentFailure;
    };
  }, []);

  const remainingOf = useCallback(
    (name) =>
      resolveRemaining(state.managerState, state.inventoryOverrides, name),
    [state.managerState, state.inventoryOverrides]
  );

  const popularTop3 = useMemo(() => {
    const candidates = Object.entries(MOCK_SOLD_TODAY_BY_NAME)
      .map(([name, soldToday]) => {
        const product = findProductByName(name);
        if (!product) return null;
        const remaining = resolveRemaining(
          state.managerState,
          state.inventoryOverrides,
          name
        );
        if (remaining !== Infinity && remaining <= 0) return null;
        const stockRemaining = remaining === Infinity ? 999 : remaining;
        return {
          ...product,
          soldToday,
          remaining: stockRemaining,
          score: soldToday * 10 - stockRemaining,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return candidates.slice(0, 3);
  }, [state.managerState, state.inventoryOverrides]);

  const customerViewState =
    state.capture.screen === 'shooting' || activeCart.length === 0
      ? 'greeting'
      : 'order';

  useEffect(() => {
    if (!state._stockWarning) return;
    const w = state._stockWarning;
    const message = w.names
      ? `재고 부족: ${w.names.join(', ')}`
      : w.remaining <= 0
        ? `${w.name}은(는) 매진되어 더 담을 수 없습니다.`
        : `${w.name}은(는) 재고 ${w.remaining}개까지만 담을 수 있습니다.`;
    showToast(message);
    dispatch({ type: 'CLEAR_STOCK_WARNING' });
  }, [state._stockWarning, showToast]);

  useEffect(() => {
    if (!state._captureSkipped) return;
    const skipped = state._captureSkipped;
    const modeLabel =
      { basic: '기본 촬영', add: '추가 촬영', retake: '다시 촬영' }[
        state.capture.mode
      ] || '촬영';
    const successMessage = {
      basic: '기본 촬영 결과를 반영했습니다.',
      add: '추가 촬영 상품을 기존 계산에 더했습니다.',
      retake: '다시 촬영한 AI 결과로 기존 인식 항목을 수정했습니다.',
    }[state.capture.mode];
    showToast(
      skipped.length
        ? `${modeLabel} 반영 · 매진/재고부족 제외: ${skipped.join(', ')}`
        : successMessage
    );
    dispatch({ type: 'CLEAR_CAPTURE_SKIPPED' });
  }, [state._captureSkipped, state.capture.mode, showToast]);

  useEffect(() => {
    if (!state._lastAdded) return;
    showToast(`${state._lastAdded} 1개를 추가했습니다.`);
    dispatch({ type: 'CLEAR_LAST_ADDED' });
  }, [state._lastAdded, showToast]);

  const applyCapture = useCallback((mode) => {
    dispatch({ type: 'APPLY_CAPTURE', mode });
  }, []);

  const changeQty = useCallback((name, delta) => {
    dispatch({ type: 'CHANGE_QTY', name, delta });
  }, []);

  const manualAdd = useCallback((name) => {
    dispatch({ type: 'MANUAL_ADD', name });
  }, []);

  const pay = useCallback(() => {
    dispatch({ type: 'PAY' });
  }, []);

  const cancelOrder = useCallback(() => {
    if (state.payment.paid || state.cart.length === 0) return;
    dispatch({ type: 'CANCEL_ORDER' });
    showToast('계산을 취소했습니다. 판매·재고에는 반영되지 않습니다.');
  }, [showToast, state.payment.paid, state.cart.length]);

  const newOrder = useCallback(() => dispatch({ type: 'NEW_ORDER' }), []);
  const openMembership = useCallback(
    () => dispatch({ type: 'OPEN_MEMBERSHIP' }),
    []
  );
  const phoneKey = useCallback(
    (key) => dispatch({ type: 'PHONE_KEY', key }),
    []
  );
  const cancelPhone = useCallback(() => dispatch({ type: 'CANCEL_PHONE' }), []);
  const confirmPhone = useCallback(
    () => dispatch({ type: 'CONFIRM_PHONE' }),
    []
  );
  const openCaptureScreen = useCallback(
    (mode) => dispatch({ type: 'OPEN_CAPTURE_SCREEN', mode }),
    []
  );
  const setCatalogType = useCallback(
    (productType) => dispatch({ type: 'SET_CATALOG_TYPE', productType }),
    []
  );
  const setCatalogCategory = useCallback(
    (category) => dispatch({ type: 'SET_CATALOG_CATEGORY', category }),
    []
  );

  const removeItem = useCallback(
    (name) => {
      const item = state.cart.find((x) => x.name === name);
      if (!item) return;
      dispatch({ type: 'CHANGE_QTY', name, delta: -item.qty });
    },
    [state.cart]
  );

  // 촬영 처리(Mock)에는 타임아웃이 없다 — 진행 중 화면을 벗어나면 반드시 여기서
  // clearTimeout으로 취소해, 이미 떠난 뒤에 결과가 뒤늦게 Cart에 반영되는(stale
  // callback) 상황을 막는다.
  const shootingRef = useRef(false);
  const shootTimeoutRef = useRef(null);
  const [isShooting, setIsShooting] = useState(false);
  const shoot = useCallback(() => {
    if (shootingRef.current) return;
    shootingRef.current = true;
    setIsShooting(true);
    shootTimeoutRef.current = setTimeout(() => {
      shootTimeoutRef.current = null;
      applyCapture(state.capture.mode);
      shootingRef.current = false;
      setIsShooting(false);
    }, 650);
  }, [applyCapture, state.capture.mode]);

  const cancelShoot = useCallback(() => {
    if (shootTimeoutRef.current) {
      clearTimeout(shootTimeoutRef.current);
      shootTimeoutRef.current = null;
    }
    shootingRef.current = false;
    setIsShooting(false);
  }, []);

  useEffect(() => {
    return () => {
      if (shootTimeoutRef.current) clearTimeout(shootTimeoutRef.current);
    };
  }, []);

  const closeCaptureScreen = useCallback(() => {
    cancelShoot();
    dispatch({ type: 'CLOSE_CAPTURE_SCREEN' });
  }, [cancelShoot]);

  return {
    state,
    dispatch,
    activeCart,
    totalCount,
    totalAmount,
    points,
    remainingOf,
    popularTop3,
    customerViewState,
    memberName: MEMBER_NAME,
    toast,
    showToast,
    changeQty,
    manualAdd,
    applyCapture,
    pay,
    cancelOrder,
    newOrder,
    openMembership,
    phoneKey,
    cancelPhone,
    confirmPhone,
    openCaptureScreen,
    closeCaptureScreen,
    setCatalogType,
    setCatalogCategory,
    shoot,
    isShooting,
    removeItem,
  };
}
