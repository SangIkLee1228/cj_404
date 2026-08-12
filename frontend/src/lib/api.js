import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

/** Calls the FastAPI backend with the current user's Supabase access token attached. */
export async function apiFetch(path, init = {}) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session) headers.set("Authorization", `Bearer ${session.access_token}`);

  return fetch(`${API_URL}${path}`, { ...init, headers });
}
