'use client';

import { apiFetch } from '@/lib/api';
import { useEffect, useState } from 'react';

/** frontend -> nginx -> FastAPI 연결이 살아 있는지 확인하는 데모 위젯. */
export function BackendStatus() {
  const [status, setStatus] = useState('loading');
  const [me, setMe] = useState(null);

  useEffect(() => {
    apiFetch('/health')
      .then((res) => setStatus(res.ok ? 'ok' : 'error'))
      .catch(() => setStatus('error'));

    apiFetch('/me')
      .then((res) => (res.ok ? res.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  return (
    <div className="rounded-md border border-slate-200 p-4 text-sm">
      <p>백엔드 상태: {status}</p>
      <p>매장: {me?.store_name ?? '-'}</p>
      <p>
        직원: {me?.name ?? '-'} ({me?.role ?? '-'})
      </p>
    </div>
  );
}
