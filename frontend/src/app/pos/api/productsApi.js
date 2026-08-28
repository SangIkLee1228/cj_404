import { apiGet } from './httpClient';

/** POS 카탈로그는 기본값(status=ACTIVE)을 쓴다. */
export function getProducts(productType) {
  return apiGet('/products', { product_type: productType, limit: 200 });
}

export function getRecommendations({ orderId, productType, limit = 3 } = {}) {
  return apiGet('/products/recommendations', {
    order_id: orderId,
    product_type: productType,
    limit,
  });
}
