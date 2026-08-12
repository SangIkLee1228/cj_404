import { createClient } from "@/lib/supabase/server";
import { BackendStatus } from "./backend-status";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">대시보드</h1>
      <p className="mt-2 text-slate-600">{user?.email} 님 환영합니다.</p>
      <BackendStatus />
    </main>
  );
}
