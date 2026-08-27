/**
 * POS 전용 backend API 클라이언트 — API 명세서 v2.0 기준.
 *
 * frontend/src/lib/api.js(apiFetch)와 같은 base URL 관례(NEXT_PUBLIC_API_URL,
 * 기본 /api)를 따르되, POS 폴더 안에서 독립적으로 두고 명세서 2.4의 에러
 * 형태({error:{code,message,details,trace_id}})를 파싱해 ApiError로 던진다.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export class ApiError extends Error {
  constructor({ code, message, details, traceId, status }) {
    super(message || '요청을 처리하지 못했습니다.');
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.traceId = traceId;
    this.status = status;
  }
}

function buildQuery(params) {
  if (!params) return '';
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
}

/** 204 No Content(예: 진행 중 주문 없음)는 null을 반환한다. */
export async function apiRequest(path, { params, ...init } = {}) {
  const url = `${API_URL}${path}${buildQuery(params)}`;
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!headers.has('Content-Type') && init.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 204) return null;

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = body?.error || {};
    throw new ApiError({
      code: err.code,
      message: err.message,
      details: err.details,
      traceId: err.trace_id,
      status: res.status,
    });
  }

  return body;
}

export function apiGet(path, params) {
  return apiRequest(path, { method: 'GET', params });
}

export function apiPost(path, body) {
  return apiRequest(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch(path, body) {
  return apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function apiDelete(path) {
  return apiRequest(path, { method: 'DELETE' });
}
