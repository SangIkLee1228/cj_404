import { apiFetch } from '@/lib/api';

/**
 * Dashboard 전용 HTTP 응답 처리 계층.
 * 실제 endpoint 함수·Zod 검증은 이후 단계(각 API 브랜치)에서 추가한다.
 */
export class DashboardApiError extends Error {
  constructor(message, { status = null } = {}) {
    super(message);
    this.name = 'DashboardApiError';
    this.status = status;
  }

  get isClientError() {
    return (
      typeof this.status === 'number' && this.status >= 400 && this.status < 500
    );
  }
}

export function isDashboardAbortError(error) {
  return (
    Boolean(error) && typeof error === 'object' && error.name === 'AbortError'
  );
}

function extractSafeMessage(body) {
  if (!body || typeof body !== 'object') {
    return null;
  }
  if (typeof body.detail === 'string') {
    return body.detail;
  }
  if (typeof body.message === 'string') {
    return body.message;
  }
  return null;
}

/**
 * apiFetch(path, init)를 호출하고 JSON 응답을 파싱해 반환한다.
 * init.signal/method/headers/body는 apiFetch에 그대로 전달된다.
 */
export async function requestDashboardJson(path, init = {}) {
  let response;
  try {
    response = await apiFetch(path, init);
  } catch (error) {
    if (isDashboardAbortError(error)) {
      throw error;
    }
    throw new DashboardApiError('네트워크 요청에 실패했습니다.', {
      status: null,
    });
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  const hasBody = text.length > 0;
  let body;

  if (hasBody) {
    try {
      body = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new DashboardApiError(
          `요청이 실패했습니다. (status ${response.status})`,
          {
            status: response.status,
          }
        );
      }
      throw new DashboardApiError('응답을 처리할 수 없습니다.', {
        status: response.status,
      });
    }
  }

  if (!response.ok) {
    const safeMessage = extractSafeMessage(body);
    throw new DashboardApiError(
      safeMessage ?? `요청이 실패했습니다. (status ${response.status})`,
      { status: response.status }
    );
  }

  return hasBody ? body : null;
}
