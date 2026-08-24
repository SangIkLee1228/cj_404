'use client';

import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useEffect, useState } from 'react';

/** Demo widget proving frontend -> nginx -> FastAPI -> Supabase Auth, and zustand's global auth state, all work end to end. */
export function BackendStatus() {
  const [status, setStatus] = useState('loading');
  const [me, setMe] = useState(null);
  const storeUser = useAuthStore((s) => s.user);

  useEffect(() => {
    apiFetch('/health')
      .then((res) => (res.ok ? setStatus('ok') : setStatus('error')))
      .catch(() => setStatus('error'));

    apiFetch('/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data?.email ?? null))
      .catch(() => setMe(null));
  }, []);

  return (
    <div className="mt-6 rounded-md border border-slate-200 p-4 text-sm">
      <p>백엔드 상태: {status}</p>
      <p>인증된 사용자(backend JWT 검증): {me ?? '-'}</p>
      <p>인증된 사용자(zustand 클라이언트 상태): {storeUser?.email ?? '-'}</p>
    </div>
  );
}
