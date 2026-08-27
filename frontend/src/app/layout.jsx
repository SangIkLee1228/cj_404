import './globals.css';

export const metadata = {
  title: 'SnapBbang',
  description: '뚜레쥬르 Vision AI 기반 빵 인식·계산·재고 운영 최적화 시스템',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
