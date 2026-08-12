import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">차량 파손이력 관리 시스템</h1>
      <p className="text-slate-600">
        Next.js + FastAPI + Supabase 보일러플레이트
      </p>
      <Link
        href="/login"
        className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
      >
        로그인
      </Link>
    </main>
  );
}
