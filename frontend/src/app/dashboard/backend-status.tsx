"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

/** Demo widget proving the frontend -> nginx -> FastAPI -> Supabase Auth chain works end to end. */
export function BackendStatus() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/health")
      .then((res) => (res.ok ? setStatus("ok") : setStatus("error")))
      .catch(() => setStatus("error"));

    apiFetch("/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data?.email ?? null))
      .catch(() => setMe(null));
  }, []);

  return (
    <div className="mt-6 rounded-md border border-slate-200 p-4 text-sm">
      <p>백엔드 상태: {status}</p>
      <p>인증된 사용자(backend 검증): {me ?? "-"}</p>
    </div>
  );
}
