const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

/**
 * FastAPI 백엔드 호출.
 * MVP는 로그인이 없으므로 토큰을 붙이지 않는다. 백엔드가 AUTH_DISABLED=true로
 * 고정 직원(store_id=1, staff_id=1)을 사용한다 (API 명세서 v1.2 · 1.1).
 */
export async function apiFetch(path, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_URL}${path}`, { ...init, headers });
}
