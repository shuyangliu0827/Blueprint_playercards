'use client';
import { useEffect, useState } from 'react';
import layoutJson from '../../../../config/layout.json';
import effectJson from '../../../../config/effect.json';
import type { Layout, Effect, Tier, CardData } from '../../../render/types';
import { renderCard } from '../../../render/layout';
import { composeShare, type AssetType } from '../../../render/sharing';
import { loadImage } from '../../../platform/web';
import CardView from '../../../components/CardView';
const layout = layoutJson as Layout,
  effect = effectJson as Effect;
export default function Debug() {
  const [items, setItems] = useState<{ type: AssetType; url: string; w: number; h: number }[]>([]),
    [front, setFront] = useState(''),
    [back, setBack] = useState(''),
    [staticMode, setStatic] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const art = await loadImage('/assets/examples/art-2.jpg');
      const data: CardData = {
        nickname: '阿澈',
        jerseyNumber: '07',
        position: '控球后卫',
        handedness: '右手',
        cardId: 'EXAMPLE · DESIGN PREVIEW',
        aiLabel: 'AI 合成示例 / 内部预览',
        tierName: '棱镜',
        story: '阿澈身披07号，以控球后卫视角阅读球场。每次移动都变成下一次选择的起点。',
        seriesName: 'BLUEPRINT',
        issuedAt: '',
      };
      const a = await renderCard(layout, effect, data, art, 'prism', 'front', false),
        b = await renderCard(layout, effect, data, art, 'prism', 'back', false),
        card = await renderCard(layout, effect, data, art, 'prism');
      if (disposed) return;
      setFront(a.toDataURL());
      setBack(b.toDataURL());
      const output = [];
      for (const type of ['card', 'poster', 'thumbnail', 'comparison'] as AssetType[]) {
        const result = await composeShare(
          type,
          card,
          art,
          data.nickname,
          new URL('/?ref=example-preview', location.origin).href,
          layout.canvas.dpi,
          layout.templateVersion,
        );
        output.push({
          type,
          url: result.canvas.toDataURL(),
          w: result.canvas.width,
          h: result.canvas.height,
        });
      }
      if (!disposed) setItems(output);
    })().catch((e) => setError(e instanceof Error ? e.message : '预览生成失败'));
    return () => {
      disposed = true;
    };
  }, []);
  return (
    <main className="debug-page">
      <a href="/" className="text-button">
        ← 回到蓝本
      </a>
      <div className="eyebrow" style={{ marginTop: 40 }}>
        DESIGN REVIEW / INTERNAL
      </div>
      <h1>小图里，还认得出你吗？</h1>
      <p>
        四种分享物按 200 × 200 像素中心裁切。这里使用示例图，不读取任何人的私人卡片。
        <br />
        海报中卡片占比 60.5%；下方可比较五种材质，并检查静态降级。
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="debug-gallery">
        {items.map((i) => (
          <div key={i.type} className="debug-item">
            <img src={i.url} alt={`${i.type}中心裁切`} />
            <h3>
              {
                {
                  card: '卡片本体',
                  poster: '分享海报',
                  thumbnail: '链接缩略图',
                  comparison: '原图与成品对比',
                }[i.type]
              }
            </h3>
            <small>
              {i.w} × {i.h} → 200 × 200
            </small>
          </div>
        ))}
      </div>
      <button className="secondary" onClick={() => setStatic(!staticMode)}>
        {staticMode ? '恢复动态 WebGL' : '强制静态降级'}
      </button>
      <div className="debug-materials">
        {front &&
          effect.materials.map((m) => (
            <div key={m.id}>
              <h3>{m.label}</h3>
              <CardView front={front} back={back} tier={m.id as Tier} forceStatic={staticMode} />
            </div>
          ))}
      </div>
      <p>同一版式、同一画面只切换材质。参数目前是标明占位的初版设计，可由设计师整体替换配置。</p>
    </main>
  );
}
