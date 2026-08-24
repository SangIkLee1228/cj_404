/**
 * POS ↔ 점장 대시보드 연동 어댑터.
 *
 * 지금은 실제 백엔드 API가 없으므로 스냅빵_직원pos.html 목업이 쓰던
 * localStorage + BroadcastChannel(+ opener postMessage) 채널을 그대로 재현한다.
 * dashboard 폴더는 수정하지 않으며, 향후 대시보드/서버가 같은 key·이벤트 형태로
 * 붙는 것을 전제로 한다 — 이 파일이 유일한 접점이고, UI 컴포넌트는 이 모듈을
 * 직접 몰라도 되도록 sync/usePosSync.js를 통해서만 소비한다.
 *
 * 나중에 실제 API로 교체할 때는 이 파일의 구현만 바꾸면 된다
 * (읽기/구독/커밋의 함수 시그니처는 유지).
 */
import { ALL_PRODUCTS, MOCK_INVENTORY_BY_NAME } from '../mock-data/mockProducts';

export const SNAP_SYNC_KEY = 'snapbbang_store_v14';
export const SNAP_EVENT_KEY = 'snapbbang_event_v14';
export const SNAP_CHANNEL = 'snapbbang_live_v14';

const STORE_ID = 'STORE-001';

function isBrowser() {
  return typeof window !== 'undefined';
}

/** 대시보드가 아직 한 번도 상태를 쓰지 않았을 때 POS 쪽에서 채워 넣는 초기값 */
function makeSeedState() {
  const products = ALL_PRODUCTS.map((p) => ({
    productId: p.productId,
    name: p.name,
    price: p.price,
    category: p.category,
    emoji: p.emoji,
    productType: p.productType,
    active: true,
  }));
  const inventory = {};
  products.forEach((p) => {
    const defaultQty = p.productType === 'BREAD' ? 30 : 24;
    const initialQty = p.name in MOCK_INVENTORY_BY_NAME ? MOCK_INVENTORY_BY_NAME[p.name] : defaultQty;
    inventory[p.productId] = {
      productId: p.productId,
      producedQty: initialQty,
      soldQty: 0,
      remainingQty: initialQty,
      updatedAt: new Date().toISOString(),
    };
  });
  return {
    version: '1.3',
    store: { storeId: STORE_ID, storeCode: 'TLJ-DEMO-01', storeName: '뚜레쥬르 스냅빵 데모매장' },
    products,
    inventory,
    orders: [],
    updatedAt: new Date().toISOString(),
  };
}

export function readSharedState() {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(SNAP_SYNC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSharedState(state) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(SNAP_SYNC_KEY, JSON.stringify(state));
  } catch {
    // 저장 실패(용량 초과 등)는 조용히 무시 — POS 로컬 상태는 이미 반영돼 있다.
  }
}

/** 공유 상태를 읽되, 없으면 POS가 seed를 만들어 채워 넣는다(대시보드를 덮어쓰지 않음). */
export function getOrSeedSharedState() {
  const existing = readSharedState();
  if (existing) return existing;
  const seeded = makeSeedState();
  writeSharedState(seeded);
  return seeded;
}

function findMasterProduct(state, name) {
  let product = state.products.find((p) => p.name === name);
  if (!product) {
    const src = ALL_PRODUCTS.find((p) => p.name === name);
    if (!src) return null;
    product = {
      productId: src.productId,
      name: src.name,
      price: src.price,
      category: src.category,
      emoji: src.emoji,
      productType: src.productType,
      active: true,
    };
    state.products.push(product);
    state.inventory[product.productId] = {
      productId: product.productId,
      producedQty: 20,
      soldQty: 0,
      remainingQty: 20,
      updatedAt: new Date().toISOString(),
    };
  }
  return product;
}

/** 결제 완료 주문을 공유 상태에 반영한다(재고 차감, 주문 이력 추가) — 대시보드가 구독하는 것과 동일한 shape. */
export function applyOrderToState(state, order) {
  if (state.orders.some((o) => o.orderId === order.orderId)) return state;
  state.orders.unshift(order);
  order.items.forEach((item) => {
    const product = findMasterProduct(state, item.name);
    if (!product) return;
    const inv =
      state.inventory[product.productId] ||
      (state.inventory[product.productId] = {
        productId: product.productId,
        producedQty: 20,
        soldQty: 0,
        remainingQty: 20,
        updatedAt: new Date().toISOString(),
      });
    inv.soldQty += item.quantity;
    inv.remainingQty = Math.max(0, inv.producedQty - inv.soldQty);
    inv.updatedAt = new Date().toISOString();
  });
  state.updatedAt = new Date().toISOString();
  return state;
}

export function buildPaidOrder({ cartItems, member, points, hasCaptured, correctionCount, scanStartedAt }) {
  const now = new Date();
  const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const itemCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  return {
    orderId: `ORD-${now.getTime()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    storeId: STORE_ID,
    orderedAt: now.toISOString(),
    status: 'PAID',
    paymentMethod: 'CARD',
    totalAmount,
    grossAmount: totalAmount,
    discountAmount: 0,
    memberApplied: member,
    pointEarned: member ? points : 0,
    scanSession: {
      hasScan: hasCaptured,
      startedAt: scanStartedAt,
      completedAt: now.toISOString(),
      correctionCount,
    },
    itemCount,
    items: cartItems.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.qty,
      unitPrice: item.price,
      subtotal: item.price * item.qty,
      sourceType: item.source === 'ai' ? 'AI_DETECTED' : item.source === 'mixed' ? 'STAFF_CORRECTED' : 'MANUAL_ADD',
    })),
  };
}

/** 결제 완료 반영: 공유 상태를 읽어 주문을 적용하고 다시 써서 다른 탭(대시보드)에 통지한다. */
export function commitPaidOrder(orderInput) {
  const order = buildPaidOrder(orderInput);
  const state = getOrSeedSharedState();
  applyOrderToState(state, order);
  writeSharedState(state);
  emitSync({ type: 'ORDER_PAID', order, state });
  return { order, state };
}

function broadcastChannel() {
  if (!isBrowser() || typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(SNAP_CHANNEL);
  } catch {
    return null;
  }
}

export function emitSync(payload) {
  if (!isBrowser()) return;
  const msg = { ...payload, source: 'POS', sentAt: new Date().toISOString() };
  const channel = broadcastChannel();
  try {
    channel?.postMessage(msg);
  } finally {
    channel?.close();
  }
  try {
    window.localStorage.setItem(SNAP_EVENT_KEY, JSON.stringify({ ...msg, nonce: Date.now() }));
  } catch {
    // 이벤트 브로드캐스트 실패는 무시 — 로컬 POS 동작에는 영향 없다.
  }
  try {
    if (window.opener && !window.opener.closed) window.opener.postMessage(msg, '*');
  } catch {
    // opener 접근 불가(다른 origin 등)는 무시.
  }
}

/**
 * 대시보드가 보내는 MANAGER_STATE를 구독한다.
 * BroadcastChannel, storage 이벤트, opener/부모 window의 postMessage 세 경로를 모두 듣는다.
 * 반환값은 해제 함수 — React effect cleanup에서 반드시 호출해 리스너 누적을 막는다.
 */
export function subscribeManagerState(onState) {
  if (!isBrowser()) return () => {};

  const handleState = (state) => {
    if (state && Array.isArray(state.products)) onState(state);
  };

  const channel = broadcastChannel();
  const onChannelMessage = (e) => {
    if (e.data?.type === 'MANAGER_STATE') handleState(e.data.state);
  };
  channel?.addEventListener('message', onChannelMessage);

  const onStorage = (e) => {
    if (e.key === SNAP_SYNC_KEY && e.newValue) {
      try {
        handleState(JSON.parse(e.newValue));
      } catch {
        // 손상된 값은 무시.
      }
    }
  };
  window.addEventListener('storage', onStorage);

  const onWindowMessage = (e) => {
    if (e.data?.type === 'MANAGER_STATE') handleState(e.data.state);
  };
  window.addEventListener('message', onWindowMessage);

  return () => {
    channel?.removeEventListener('message', onChannelMessage);
    channel?.close();
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('message', onWindowMessage);
  };
}

/** managerState 기준 잔여 재고. 상품을 못 찾으면 null(호출부가 POS 로컬 mock으로 폴백). */
export function remainingFromManagerState(managerState, name) {
  if (!managerState) return null;
  const product = managerState.products?.find((p) => p.name === name);
  if (!product) return null;
  if (product.active === false) return 0; // 대시보드에서 비활성화한 상품은 매진과 동일하게 취급한다.
  const inv = managerState.inventory?.[product.productId];
  if (!inv) return null;
  return Math.max(0, Number(inv.remainingQty ?? 0));
}

/**
 * 재고 조회 단일 진입점 — managerState(대시보드 동기화) 우선,
 * 없으면 POS 로컬 mock(MOCK_INVENTORY_BY_NAME), 그것도 없으면 무제한(Infinity)으로 취급한다.
 */
export function resolveRemaining(managerState, fallbackOverrides, name) {
  const fromManager = remainingFromManagerState(managerState, name);
  if (fromManager !== null) return fromManager;
  if (name in MOCK_INVENTORY_BY_NAME) {
    return name in fallbackOverrides ? fallbackOverrides[name] : MOCK_INVENTORY_BY_NAME[name];
  }
  return Infinity;
}

/** 대시보드 상품 가격/카테고리/활성 상태를 POS 카탈로그에 덧씌운다(이름으로 매칭). 비활성 상품은 목록에서 제외한다. */
export function mergeCatalogWithManagerState(baseCatalog, managerState) {
  if (!managerState) return baseCatalog;
  return baseCatalog
    .map((base) => {
      const mp = managerState.products?.find((p) => p.name === base.name);
      if (!mp) return base;
      return {
        ...base,
        price: Number(mp.price ?? base.price),
        category: mp.category || base.category,
        emoji: mp.emoji || base.emoji,
        active: mp.active !== false,
      };
    })
    .filter((p) => p.active !== false);
}
