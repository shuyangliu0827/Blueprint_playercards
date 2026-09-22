import type { Metadata, Viewport } from 'next';
import './globals.css';
import '../styles/cards-css-photo.css';
import '../styles/cards-css-adapter.css';
export const metadata: Metadata = {
  title: '蓝本 BLUEPRINT · 做一张属于你的篮球卡',
  description: '每一个上场的你，都值得一张。个人数字篮球卡 · 内部设计预览。',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f2f0e9' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
