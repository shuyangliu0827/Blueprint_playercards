import QRCode from 'qrcode';
import { makeCanvas, drawFittedImage } from './layout';
import { canvasPng } from './png-metadata';
export const POSTER_CARD_RECT = { x: 130, y: 25, w: 820, h: 1148 } as const;

export type AssetType = 'card' | 'poster' | 'thumbnail' | 'comparison';
export async function composeShare(
  type: AssetType,
  card: HTMLCanvasElement,
  original: CanvasImageSource | null,
  nickname: string,
  url: string,
  dpi = 300,
  templateVersion = 'blueprint-v0.1',
) {
  let canvas: HTMLCanvasElement;
  if (type === 'card') canvas = card;
  else {
    const dims =
      type === 'poster' ? [1080, 1440] : type === 'thumbnail' ? [1000, 800] : [2400, 1600];
    canvas = makeCanvas(dims[0]!, dims[1]!);
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#0b111c';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#e3e6ed';
    c.textBaseline = 'top';
    if (type === 'poster') {
      // Exact 5:7 and horizontally centered; 60.53% of the poster area.
      const r = POSTER_CARD_RECT;
      c.drawImage(card, r.x, r.y, r.w, r.h);
      c.font = '700 38px Arial,"PingFang SC",sans-serif';
      c.fillText(`${nickname}的篮球卡`, 70, 1190);
      c.font = '25px Arial,"PingFang SC",sans-serif';
      c.fillStyle = '#9facbf';
      c.fillText('每一个上场的你，都值得一张。', 70, 1250);
      c.fillText('扫码 · 做我的篮球卡', 70, 1310);
      const qr = await QRCode.toCanvas(url, {
        width: 170,
        margin: 3,
        errorCorrectionLevel: 'M',
        color: { dark: '#0b111c', light: '#ffffff' },
      });
      c.drawImage(qr, 840, 1210, 170, 170);
    }
    if (type === 'thumbnail') {
      c.drawImage(card, 35, -140, 690, 966);
      let size = 46;
      do {
        c.font = `800 ${size}px Arial,"PingFang SC",sans-serif`;
        if (c.measureText(nickname).width <= 150) break;
        size--;
      } while (size > 10);
      c.fillText(nickname, 745, 260);
      c.font = '22px Arial,"PingFang SC",sans-serif';
      c.fillText('我的球场时刻', 745, 650);
    }
    if (type === 'comparison') {
      if (!original) throw new Error('缺少原始照片');
      c.font = '700 52px Arial,"PingFang SC",sans-serif';
      c.fillText('从这一刻，到你的主场。', 95, 80);
      const size = original as {
        width: number;
        height: number;
        naturalWidth?: number;
        naturalHeight?: number;
      };
      drawFittedImage(
        c,
        original,
        size.naturalWidth ?? size.width,
        size.naturalHeight ?? size.height,
        95,
        225,
        1130,
        1210,
        'contain',
      );
      c.drawImage(card, 1330, 160, 950, 1330);
      c.font = '28px Arial,"PingFang SC",sans-serif';
      c.fillStyle = '#9facbf';
      c.fillText('原始照片 · 用户提供', 95, 1480);
      c.fillText('AI 艺术生成 · BLUEPRINT', 1330, 1510);
    }
  }
  return { canvas, blob: await canvasPng(canvas, dpi, templateVersion) };
}
