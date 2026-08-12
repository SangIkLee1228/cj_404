"use client";

import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect } from "react";

/** Mounted once in the root layout: keeps useAuthStore's `user` in sync with Supabase Auth. */
export function SupabaseAuthListener() {
  useEffect(() => {
    const supabase = createClient();
    const setUser = useAuthStore.getState().setUser;

    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return null;
}
