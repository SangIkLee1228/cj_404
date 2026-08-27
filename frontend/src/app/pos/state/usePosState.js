'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createOrder,
  getCurrentOrder,
  getOrder,
  addOrderItem,
  updateOrderItem,
  deleteOrderItem,
  connectMember,
  payOrder,
  cancelOrder as cancelOrderApi,
} from '../api/ordersApi';
import { getProducts, getRecommendations } from '../api/productsApi';
import { getInventory } from '../api/inventoryApi';
import {
  createScanSession,
  recognizeScanSession,
} from '../api/scanSessionsApi';
import { ApiError } from '../api/httpClient';
import {
  DRINK_CATALOG,
  isLocalDrinkId,
  findDrinkById,
} from '../data/drinkCatalog';
import { filterAndOrderBreadProducts } from '../data/allowedBreadProducts';

const initialCapture = { mode: 'basic', screen: 'recognition' };
const initialMembership = {
  phone: '010',
  phoneOverlayOpen: false,
  lookupFailed: false,
};

/** ORDER_ITEM(서버 필드명) → 기존 컴포넌트가 쓰던 cart item 모양으로 변환한다. BREAD 전용. */
function mapOrderItem(item) {
  const source =
    item.source_type === 'AI_DETECTED'
      ? 'ai'
      : item.source_type === 'STAFF_CORRECTED'
        ? 'mixed'
        : 'manual';
  return {
    name: item.product_name,
    price: item.unit_price,
    qty: item.quantity,
    productId: item.product_id,
    orderItemId: item.order_item_id,
    source,
    belowThreshold: item.needs_review,
    emoji: '🍞',
    isLocalDrink: false,
  };
}

/** PRODUCT/STORE_PRODUCT(서버 필드명) → 카탈로그 카드가 쓰던 모양으로 변환한다. BREAD 전용. */
function mapProduct(p) {
  return {
    productId: p.product_id,
    name: p.product_name,
    price: p.price,
    category: p.category || '기타',
    productType: p.product_type,
    imageUrl: p.image_url,
    emoji: '🍞',
  };
}

/** localDrinkItems(수량 맵) → 기존 컴포넌트가 쓰던 cart item 모양으로 변환한다. */
function mapDrinkCartItem(entry) {
  const drink = findDrinkById(entry.productId);
  return {
    name: drink.name,
    price: drink.price,
    qty: entry.qty,
    productId: drink.productId,
    orderItemId: null,
    source: 'manual',
    belowThreshold: false,
    emoji: drink.emoji,
    isLocalDrink: true,
  };
}

export function usePosState() {
  const [orderId, setOrderId] = useState(null);
  const [orderRaw, setOrderRaw] = useState(null); // 서버 OrderDetail 원본 — BREAD 전용
  const [breadProducts, setBreadProducts] = useState([]);
  const [localDrinkItems, setLocalDrinkItems] = useState([]); // [{productId, qty}] — Frontend-only
  const [drinkPaid, setDrinkPaid] = useState(false); // 음료 몫의 "결제 완료" 로컬 표시 상태
  const [remainingByProductId, setRemainingByProductId] = useState({});
  const [popularTop3, setPopularTop3] = useState([]);
  const [initializing, setInitializing] = useState(true);
  const [capture, setCapture] = useState(initialCapture);
  const [hasCaptured, setHasCaptured] = useState(false);
  const [membership, setMembership] = useState(initialMembership);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [isShooting, setIsShooting] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState({
    productType: 'bread',
    category: '전체',
  });
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const captureRunRef = useRef(0);

  // 카탈로그 카드 그리드는 BREAD(backend)와 DRINK(frontend-only)를 합쳐서 그대로 쓴다 —
  // ProductCatalog/ProductCard는 이 배열의 출처를 몰라도 되게 만든다.
  const products = useMemo(
    () => [...breadProducts, ...DRINK_CATALOG],
    [breadProducts]
  );

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const refreshInventory = useCallback(async () => {
    try {
      const res = await getInventory();
      const map = {};
      res.items.forEach((row) => {
        map[row.product_id] = row.remaining_qty;
      });
      setRemainingByProductId(map);
    } catch {
      // 재고 조회 실패는 화면을 막지 않는다 — 매진 표시만 못 하고 넘어간다.
    }
  }, []);

  // 최초 진입: 진행 중 주문 복구(없으면 생성) + BREAD 카탈로그 + 재고를 불러온다.
  // DRINK는 backend를 전혀 부르지 않는다(DRINK_CATALOG는 정적 import).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [current, bread] = await Promise.all([
          getCurrentOrder(),
          getProducts('BREAD'),
        ]);
        if (cancelled) return;
        const order = current || (await createOrder());
        if (cancelled) return;
        setOrderId(order.order_id);
        setOrderRaw(order);
        setBreadProducts(
          filterAndOrderBreadProducts(bread.items).map(mapProduct)
        );
        await refreshInventory();
      } catch (err) {
        if (!cancelled)
          showToast(err?.message || '초기 데이터를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const breadCart = useMemo(
    () => orderRaw?.items?.map(mapOrderItem) || [],
    [orderRaw]
  );
  const drinkCart = useMemo(
    () => localDrinkItems.map(mapDrinkCartItem),
    [localDrinkItems]
  );
  // 화면에는 BREAD(backend 주문)와 DRINK(local state)를 하나의 장바구니처럼 합쳐서 보여준다.
  const activeCart = useMemo(
    () => [...breadCart, ...drinkCart].filter((item) => item.qty > 0),
    [breadCart, drinkCart]
  );
  const activeBreadCart = useMemo(
    () => breadCart.filter((item) => item.qty > 0),
    [breadCart]
  );
  const activeDrinkCart = useMemo(
    () => drinkCart.filter((item) => item.qty > 0),
    [drinkCart]
  );
  const totalCount = activeCart.reduce((sum, item) => sum + item.qty, 0);
  const drinkTotalAmount = activeDrinkCart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );
  // 화면 총액 = Backend BREAD 합계 + Frontend DRINK 합계.
  const totalAmount = (orderRaw?.total_amount ?? 0) + drinkTotalAmount;
  const points = orderRaw?.point_earned ?? 0; // 적립은 BREAD(backend) 기준 그대로 — DRINK로 늘리지 않는다.
  // "결제 완료" 표시는 BREAD가 결제됐거나(backend), DRINK만 있는 채로 로컬 결제 처리됐으면 true다.
  const paid = orderRaw?.status === 'PAID' || drinkPaid;
  const memberConfirmed = !!orderRaw?.member;
  const memberName = orderRaw?.member?.name ?? '';

  // 추천은 실제 backend 주문(BREAD)에 담긴 것이 있을 때만 부른다 — DRINK 담기 때문에
  // 새 backend 요청이 생기면 안 되므로 activeBreadCart를 기준으로 삼는다.
  useEffect(() => {
    if (!orderId || activeBreadCart.length === 0 || paid) {
      setPopularTop3([]);
      return;
    }
    let cancelled = false;
    getRecommendations({ orderId, productType: 'ALL', limit: 3 })
      .then((res) => {
        if (cancelled) return;
        setPopularTop3(
          res.items.map((p) => ({
            productId: p.product_id,
            name: p.product_name,
            price: p.price,
            emoji: p.product_type === 'BREAD' ? '🍞' : '☕',
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setPopularTop3([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, activeBreadCart.length, paid]);

  const remainingOf = useCallback(
    (productId) => {
      if (isLocalDrinkId(productId)) return Infinity; // DRINK는 backend 재고 조회 대상이 아니다.
      return remainingByProductId[productId] ?? Infinity;
    },
    [remainingByProductId]
  );

  const runOrderMutation = useCallback(
    async (mutate) => {
      try {
        const updated = await mutate();
        setOrderRaw(updated);
        return updated;
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.code === 'AMOUNT_STALE' || err.code === 'ORDER_CHANGED')
        ) {
          const fresh = await getOrder(orderId);
          setOrderRaw(fresh);
          showToast(
            '주문 내용이 갱신되어 다시 불러왔습니다. 다시 시도해주세요.'
          );
          return fresh;
        }
        showToast(err?.message || '요청을 처리하지 못했습니다.');
        return null;
      }
    },
    [orderId, showToast]
  );

  const manualAdd = useCallback(
    (productId) => {
      if (isLocalDrinkId(productId)) {
        const drink = findDrinkById(productId);
        if (!drink) return;
        setLocalDrinkItems((prev) => {
          const existing = prev.find((x) => x.productId === productId);
          if (existing) {
            return prev.map((x) =>
              x.productId === productId ? { ...x, qty: x.qty + 1 } : x
            );
          }
          return [...prev, { productId, qty: 1 }];
        });
        showToast(`${drink.name} 1개를 추가했습니다.`);
        return;
      }
      const product = breadProducts.find((p) => p.productId === productId);
      runOrderMutation(() => addOrderItem(orderId, productId, 1)).then(
        (updated) => {
          if (updated && product)
            showToast(`${product.name} 1개를 추가했습니다.`);
        }
      );
    },
    [orderId, breadProducts, runOrderMutation, showToast]
  );

  const changeQty = useCallback(
    (name, delta) => {
      const item = activeCart.find((x) => x.name === name);
      if (!item) return;
      const nextQty = item.qty + delta;
      if (item.isLocalDrink) {
        setLocalDrinkItems((prev) =>
          nextQty <= 0
            ? prev.filter((x) => x.productId !== item.productId)
            : prev.map((x) =>
                x.productId === item.productId ? { ...x, qty: nextQty } : x
              )
        );
        return;
      }
      if (nextQty <= 0) {
        runOrderMutation(() => deleteOrderItem(orderId, item.orderItemId));
        return;
      }
      runOrderMutation(() =>
        updateOrderItem(orderId, item.orderItemId, { quantity: nextQty })
      );
    },
    [activeCart, orderId, runOrderMutation]
  );

  const removeItem = useCallback(
    (name) => {
      const item = activeCart.find((x) => x.name === name);
      if (!item) return;
      if (item.isLocalDrink) {
        setLocalDrinkItems((prev) =>
          prev.filter((x) => x.productId !== item.productId)
        );
        return;
      }
      runOrderMutation(() => deleteOrderItem(orderId, item.orderItemId));
    },
    [activeCart, orderId, runOrderMutation]
  );

  const resetLocalUiState = useCallback(() => {
    setCapture(initialCapture);
    setMembership(initialMembership);
    setPaymentFailed(false);
    setHasCaptured(false);
    setLocalDrinkItems([]);
    setDrinkPaid(false);
  }, []);

  const cancelOrder = useCallback(async () => {
    if (paid || activeCart.length === 0) return;
    try {
      await cancelOrderApi(orderId);
      const fresh = await createOrder();
      setOrderId(fresh.order_id);
      setOrderRaw(fresh);
      resetLocalUiState();
      showToast('계산을 취소했습니다. 판매·재고에는 반영되지 않습니다.');
    } catch (err) {
      showToast(err?.message || '계산 취소에 실패했습니다.');
    }
  }, [orderId, paid, activeCart.length, resetLocalUiState, showToast]);

  const newOrder = useCallback(async () => {
    try {
      const fresh = await createOrder();
      setOrderId(fresh.order_id);
      setOrderRaw(fresh);
      resetLocalUiState();
      await refreshInventory();
    } catch (err) {
      showToast(err?.message || '새 주문을 시작하지 못했습니다.');
    }
  }, [resetLocalUiState, refreshInventory, showToast]);

  // BREAD가 있으면 그 몫만 backend pay로 결제하고, DRINK 몫은 항상 로컬에서
  // 결제 완료 처리한다 — DRINK를 backend 주문 항목으로 만들어 끼워 넣지 않는다.
  const pay = useCallback(async () => {
    if (activeCart.length === 0 || paid) return;
    try {
      if (activeBreadCart.length > 0) {
        await payOrder(orderId, 'CARD', 0);
        // pay 응답에는 items가 없으므로 확정 주문 상세를 다시 받아 화면을 채운다.
        const fresh = await getOrder(orderId);
        setOrderRaw(fresh);
        await refreshInventory();
      }
      setDrinkPaid(true);
      setPaymentFailed(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setPaymentFailed(true);
        return;
      }
      if (
        err instanceof ApiError &&
        (err.code === 'AMOUNT_STALE' || err.code === 'ORDER_CHANGED')
      ) {
        const fresh = await getOrder(orderId);
        setOrderRaw(fresh);
        showToast('주문 내용이 바뀌어 다시 불러왔습니다. 다시 결제해주세요.');
        return;
      }
      showToast(err?.message || '결제에 실패했습니다.');
    }
  }, [
    orderId,
    activeCart.length,
    activeBreadCart.length,
    paid,
    refreshInventory,
    showToast,
  ]);

  const openMembership = useCallback(() => {
    if (activeCart.length === 0 || paid || memberConfirmed) return;
    setMembership({
      phone: '010',
      phoneOverlayOpen: true,
      lookupFailed: false,
    });
  }, [activeCart.length, paid, memberConfirmed]);

  const phoneKey = useCallback((key) => {
    setMembership((m) => {
      let phone = m.phone;
      if (key === 'back') phone = phone.length > 3 ? phone.slice(0, -1) : phone;
      else if (phone.length < 11) phone += key;
      return { ...m, phone, lookupFailed: false };
    });
  }, []);

  const cancelPhone = useCallback(() => {
    setMembership({
      phone: '010',
      phoneOverlayOpen: false,
      lookupFailed: false,
    });
  }, []);

  const confirmPhone = useCallback(async () => {
    if (membership.phone.length !== 11) return;
    try {
      const updated = await connectMember(orderId, membership.phone);
      setOrderRaw(updated);
      setMembership({
        phone: '010',
        phoneOverlayOpen: false,
        lookupFailed: false,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setMembership({
          phone: '010',
          phoneOverlayOpen: true,
          lookupFailed: true,
        });
        return;
      }
      showToast(err?.message || 'CJ ONE 조회에 실패했습니다.');
    }
  }, [orderId, membership.phone, showToast]);

  const openCaptureScreen = useCallback(
    (mode) => {
      if (paid) return;
      setCapture({ mode, screen: 'shooting' });
    },
    [paid]
  );

  const closeCaptureScreen = useCallback(() => {
    captureRunRef.current += 1; // 진행 중이던 shoot() 결과를 무효화한다.
    setIsShooting(false);
    setCapture((c) => ({ ...c, screen: 'recognition' }));
  }, []);

  // AI 추론 서버는 아직 연결 전이라(명세서 5.4, 항상 501) 실제 이미지 업로드 없이
  // 세션만 만들고 recognize를 호출해 "미연결" 안내로 이어지는 FR-10 경로를 그대로 탄다.
  // (AI/촬영은 BREAD 전용 개념이며 이번 작업 대상이 아니다 — 그대로 둔다.)
  const shoot = useCallback(() => {
    if (isShooting) return;
    setIsShooting(true);
    const runId = ++captureRunRef.current;
    (async () => {
      try {
        const session = await createScanSession({
          orderId,
          captureType: capture.mode.toUpperCase(),
        });
        const result = await recognizeScanSession(session.scan_session_id);
        if (captureRunRef.current !== runId) return; // 화면을 벗어났으면 결과를 버린다.
        setHasCaptured(true);
        if (result?.notImplemented) {
          showToast(
            'AI 인식 서버가 아직 연결되지 않았습니다. 직접 추가로 진행해주세요.'
          );
        }
      } catch (err) {
        if (captureRunRef.current !== runId) return;
        showToast(err?.message || '촬영 처리에 실패했습니다.');
      } finally {
        if (captureRunRef.current === runId) {
          setIsShooting(false);
          setCapture((c) => ({ ...c, screen: 'recognition' }));
        }
      }
    })();
  }, [isShooting, orderId, capture.mode, showToast]);

  const setCatalogType = useCallback((productType) => {
    setCatalogFilter({ productType, category: '전체' });
  }, []);
  const setCatalogCategory = useCallback((category) => {
    setCatalogFilter((f) => ({ ...f, category }));
  }, []);

  const customerViewState =
    capture.screen === 'shooting' || activeCart.length === 0
      ? 'greeting'
      : 'order';

  return {
    state: {
      capture: { ...capture, hasCaptured },
      membership: { ...membership, memberConfirmed },
      payment: { paid, failed: paymentFailed },
      catalogFilter,
    },
    initializing,
    products,
    activeCart,
    totalCount,
    totalAmount,
    points,
    remainingOf,
    popularTop3,
    customerViewState,
    memberName,
    toast,
    showToast,
    changeQty,
    manualAdd,
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
