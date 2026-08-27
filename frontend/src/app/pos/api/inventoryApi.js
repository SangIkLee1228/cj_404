import { apiGet } from './httpClient';

/**
 * MANAGER 전용이 아니다(명세서 2.1) — POS가 카탈로그 카드의 매진 표시와
 * 계산 목록의 "추정 N개"를 위해 그대로 쓴다.
 */
export function getInventory(params) {
  return apiGet('/inventory', { limit: 200, ...params });
}
