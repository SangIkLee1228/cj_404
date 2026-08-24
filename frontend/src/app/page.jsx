import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">스냅빵 (SnapBbang)</h1>
      <p className="text-slate-600">
        뚜레쥬르 Vision AI 기반 빵 인식·계산·재고 운영 최적화 시스템 — Next.js +
        FastAPI + Supabase
      </p>
      <Link
        href="/dashboard"
        className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
      >
        대시보드로 이동
      </Link>
    </main>
  );
}
