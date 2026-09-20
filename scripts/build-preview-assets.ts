import layoutJson from '../config/layout.json';
import effectJson from '../config/effect.json';
import { renderCard, makeCanvas } from '../src/render/layout';
import { createMaterialRenderer } from '../src/render/webgl';
import { loadImage } from '../src/platform/web';
import type { Layout, Effect, Tier, CardData } from '../src/render/types';
Object.assign(window, {
  buildPreviewAssets: async () => {
    const layout = layoutJson as Layout,
      effect = effectJson as Effect;
    const output: Record<string, string> = {};
    for (const m of effect.materials) {
      const c = makeCanvas(1404, 2004);
      const r = await createMaterialRenderer(c, m);
      r.draw(m.staticFallback.captureUniforms);
      output[m.staticFallback.imageRef] = c.toDataURL();
      r.dispose(true);
    }
    for (let i = 1; i <= 3; i++) {
      const art = await loadImage(`/assets/examples/art-${i}.jpg`);
      const tier = (['silver', 'prism', 'gold'] as Tier[])[i - 1]!;
      const data: CardData = {
        nickname: ['林一', '阿澈', '小野'][i - 1]!,
        jerseyNumber: ['23', '07', '11'][i - 1]!,
        position: ['得分后卫', '控球后卫', '小前锋'][i - 1]!,
        handedness: '右手',
        cardId: 'EXAMPLE · DESIGN PREVIEW',
        aiLabel: 'AI 合成示例 / 内部预览',
        tierName: effect.materials.find((m) => m.id === tier)!.label,
        story: '每一个上场的你，都值得一张。这张卡记录此刻，为下一回合留下空间。',
        seriesName: 'BLUEPRINT',
        issuedAt: '',
      };
      const c = await renderCard(layout, effect, data, art, tier);
      output[`examples/card-${i}.png`] = c.toDataURL();
    }
    return output;
  },
});
