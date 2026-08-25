/**
 * POS 전용 browser Supabase client.
 *
 * frontend/src/lib/** 같은 공통 영역에 의존하지 않고 POS 폴더 내부에서
 * 독립적으로 client를 구성한다. 반드시 public(anon) credential만 사용하며,
 * SUPABASE_SERVICE_ROLE_KEY / SUPABASE_JWT_SECRET 등 backend 전용 secret은
 * 이 경로에서 절대 참조하지 않는다.
 */
import { createClient } from '@supabase/supabase-js';

let posSupabaseClient = null;

/** POS 전용 singleton Supabase client. 최초 호출 시 1회만 생성한다. */
export function getPosSupabaseClient() {
  if (posSupabaseClient) return posSupabaseClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      '[pos/supabase] NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다. frontend/.env.local을 확인하세요.'
    );
  }
  if (!anonKey) {
    throw new Error(
      '[pos/supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다. frontend/.env.local을 확인하세요.'
    );
  }

  posSupabaseClient = createClient(url, anonKey);
  return posSupabaseClient;
}
