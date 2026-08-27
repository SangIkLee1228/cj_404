import { apiRequest, apiPost } from './httpClient';

/** multipart/form-data, 필드명 file. purpose 기본값은 SCAN. */
export function uploadImage(file, purpose = 'SCAN') {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest('/storage/images', {
    method: 'POST',
    body: formData,
    params: { purpose },
  });
}

export function createScanSession({
  orderId,
  captureType = 'BASIC',
  imagePath,
}) {
  return apiPost('/scan-sessions', {
    order_id: orderId,
    capture_type: captureType,
    image_path: imagePath,
  });
}

export function getScanSession(id) {
  return apiRequest(`/scan-sessions/${id}`, { method: 'GET' });
}

/**
 * AI 추론 서버가 아직 연결되지 않은 동안은 501을 반환한다 — 이는 오류가 아니라
 * "아직 구현되지 않음" 상태이므로 apiRequest가 던지는 ApiError를 그대로 잡아
 * 정상적인 { notImplemented: true } 결과로 바꿔 돌려준다. 그 외 오류는 그대로 던진다.
 */
export async function recognizeScanSession(id) {
  try {
    return await apiPost(`/scan-sessions/${id}/recognize`);
  } catch (err) {
    if (err?.status === 501) return { notImplemented: true };
    throw err;
  }
}

export function cancelScanSession(id) {
  return apiPost(`/scan-sessions/${id}/cancel`);
}

export function discardScanSession(id) {
  return apiPost(`/scan-sessions/${id}/discard`);
}
