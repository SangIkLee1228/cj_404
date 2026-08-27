/**
 * POS 전용 Supabase adapter.
 *
 * UI 컴포넌트나 page.jsx가 client.js를 직접 호출하지 않도록 하는 얇은 진입점.
 * 나중에 실제 POS 기능(촬영 업로드, 인식 결과 저장 등)이 Supabase와 연결될 때
 * 이 파일만 확장하면 되고 UI는 그대로 둔다.
 *
 * 현재 backend에는 POS용 DB schema/API/AI pipeline이 없으므로 products,
 * scan_sessions, detections, orders 같은 테이블 이름을 추측해서 호출하지 않는다.
 * 이 단계에서 제공하는 기능은 client readiness 확인과 안전한 연결 가능 여부
 * 확인뿐이다.
 */
import { getPosSupabaseClient } from './client';

/** client 생성(=env 값 존재)이 가능한 상태인지만 확인한다. 값은 반환/로그하지 않는다. */
export function isPosSupabaseReady() {
  try {
    getPosSupabaseClient();
    return true;
  } catch {
    return false;
  }
}

/**
 * Supabase 프로젝트의 REST endpoint에 실제로 HTTPS 접근이 가능한지 확인한다.
 * 특정 테이블을 추측해서 query하지 않고, PostgREST가 항상 제공하는 루트
 * 엔드포인트(`/rest/v1/`)에 anon key로 요청해 reachability만 판단한다.
 * DB write, storage upload, auth 사용자 생성은 하지 않는다.
 */
export async function checkPosSupabaseConnection() {
  if (!isPosSupabaseReady()) {
    return { reachable: false, reason: 'NOT_READY' };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'GET',
      headers: { apikey: anonKey },
    });
    // PostgREST root는 401/404여도 "서버가 응답했다"는 뜻이므로 reachable로 본다.
    // 5xx나 fetch 자체 실패(네트워크 오류, malformed URL)만 unreachable로 취급한다.
    return { reachable: res.status < 500, reason: `HTTP_${res.status}` };
  } catch (err) {
    return { reachable: false, reason: err?.name || 'FETCH_ERROR' };
  }
}
