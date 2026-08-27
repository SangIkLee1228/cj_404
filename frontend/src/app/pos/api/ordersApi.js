import { apiGet, apiPost, apiPatch, apiDelete } from './httpClient';

/** 새 계산 시작 — 빈 PENDING 주문이 있으면 서버가 그것을 재사용한다(멱등). */
export function createOrder() {
  return apiPost('/orders');
}

/** 진행 중인 PENDING 주문 복구. 없으면 null(서버가 204를 준다). */
export function getCurrentOrder() {
  return apiGet('/orders/current');
}

export function getOrder(orderId) {
  return apiGet(`/orders/${orderId}`);
}

export function getOrders(params) {
  return apiGet('/orders', params);
}

/** 카탈로그·추천에서 직접 추가. 동일 product_id는 서버가 알아서 합산한다. */
export function addOrderItem(orderId, productId, quantity = 1) {
  return apiPost(`/orders/${orderId}/items`, {
    product_id: productId,
    quantity,
  });
}

/** quantity 또는 productId 중 정확히 하나만 보낸다. */
export function updateOrderItem(orderId, itemId, patch) {
  return apiPatch(`/orders/${orderId}/items/${itemId}`, patch);
}

export function deleteOrderItem(orderId, itemId) {
  return apiDelete(`/orders/${orderId}/items/${itemId}`);
}

export function connectMember(orderId, phone) {
  return apiPost(`/orders/${orderId}/member`, { phone });
}

export function disconnectMember(orderId) {
  return apiDelete(`/orders/${orderId}/member`);
}

export function applyDiscount(orderId, amount, reason) {
  return apiPost(`/orders/${orderId}/discount`, { amount, reason });
}

export function payOrder(orderId, paymentMethod = 'CARD', pointUsed = 0) {
  return apiPost(`/orders/${orderId}/pay`, {
    payment_method: paymentMethod,
    point_used: pointUsed,
  });
}

export function cancelOrder(orderId) {
  return apiPost(`/orders/${orderId}/cancel`);
}
