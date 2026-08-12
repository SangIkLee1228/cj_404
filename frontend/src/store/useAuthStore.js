import { create } from "zustand";

/**
 * Client-side auth state, kept in sync by <SupabaseAuthListener/> (see
 * src/components/supabase-auth-listener.jsx, mounted once in the root layout).
 * Use this when a Client Component needs the current user without re-fetching
 * it itself - e.g. `const user = useAuthStore((s) => s.user)`.
 */
export const useAuthStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
