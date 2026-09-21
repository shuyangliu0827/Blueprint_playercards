'use client';
import { useEffect, useState } from 'react';
import MvpCardView from '../../../components/MvpCardView';
import { renderMvpCard, type CardSeries } from '../../../render/mvp-card';
import { loadImage } from '../../../platform/web';
import type { CardData, Tier } from '../../../render/types';
const data: CardData = {
  nickname: '球员姓名',
  jerseyNumber: '09',
  position: 'SG',
  handedness: '右手',
  cardId: 'TEST',
  aiLabel: '验证图片',
  tierName: '',
  story: '',
  seriesName: '',
  issuedAt: '',
};
export default function Page() {
  const [items, setItems] = useState<
    { front: string; exported: string; tier: Tier; series: CardSeries }[]
  >([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const artwork = await loadImage('/assets/mvp/demo-photo.jpg');
      const result = [];
      for (const [tier, series] of [
        ['silver', 'classic'],
        ['gold', 'classic'],
        ['prism', 'classic'],
        ['silver', 'aura'],
        ['prism', 'animation'],
      ] as [Tier, CardSeries][]) {
        const front = await renderMvpCard({ artwork, data, tier, series });
        const exported = await renderMvpCard({
          artwork,
          data,
          tier,
          series,
          includeMaterial: true,
        });
        result.push({ front: front.toDataURL(), exported: exported.toDataURL(), tier, series });
      }
      if (!disposed) setItems(result);
    })().catch((e) => {
      if (!disposed) setError(e instanceof Error ? e.message : '模板检查失败');
    });
    return () => {
      disposed = true;
    };
  }, []);
  return (
    <main style={{ padding: 30, background: '#11141b', color: 'white', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 30 }}>模板材质验证 · 内部视觉检查</h1>
      <p style={{ color: '#a9b3c2', lineHeight: 1.7 }}>
        全部卡片使用同一张原始测试照片，不是实时生成结果。此页仅用于比较固定版式与动态材质；AURA
        艺术化和 ANIMATION 卡通化由真实生成流程提供。
      </p>
      {error && <p role="alert">{error}</p>}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
          gap: 24,
          marginTop: 30,
        }}
      >
        {items.map((item) => (
          <div key={item.tier + item.series}>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>
              {item.series} / {item.tier}
            </h2>
            <MvpCardView front={item.front} tier={item.tier} series={item.series} />
            <a
              href={item.exported}
              download={`template-check-${item.series}-${item.tier}.png`}
              style={{
                display: 'block',
                textAlign: 'center',
                marginTop: 15,
                color: '#c0cddf',
                fontSize: 12,
              }}
            >
              下载含材质的静态验证图
            </a>
          </div>
        ))}
      </div>
    </main>
  );
}
