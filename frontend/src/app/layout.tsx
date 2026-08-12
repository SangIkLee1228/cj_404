import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CJ-X-Vision",
  description: "차량/파손이력/사용자 관리 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
