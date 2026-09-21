import type { Rect, Tier } from './types';
import type { CardSeries } from './mvp-card';

export const MVP_WIDTH = 1000;
export const MVP_HEIGHT = 1400;
export const MATERIAL_REST = { x: 0.22, y: -0.18 };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (a: number, b: number, n: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function fitArtwork(width: number, height: number, box: Rect): Rect {
  if (!(width > 0 && height > 0)) throw new Error('图片尺寸无效');
  const scale = Math.min(box.w / width, box.h / height);
  return {
    x: box.x + (box.w - width * scale) / 2,
    y: box.y + (box.h - height * scale) / 2,
    w: width * scale,
    h: height * scale,
  };
}

/** Conservative material mask: the central athlete and all deterministic type stay clean. */
export function materialCoverage(x: number, y: number, series: CardSeries): number {
  const edge = 1 - smooth(0.025, 0.105, Math.min(x, 1 - x, y, 1 - y));
  const subject = 1 - smooth(0.27, 0.43, Math.abs(x - 0.5));
  const interior = (1 - subject) * 0.52;
  const protect = (left: number, top: number, right: number, bottom: number) =>
    smooth(left - 0.025, left, x) *
    (1 - smooth(right, right + 0.025, x)) *
    smooth(top - 0.025, top, y) *
    (1 - smooth(bottom, bottom + 0.025, y));
  const titleBottom = series === 'classic' ? 0.13 : 0.2;
  const title = protect(0.085, 0.024, 0.965, titleBottom);
  const footer = protect(0.06, 0.865, 0.95, 0.975);
  const logo = series === 'animation' ? protect(0.025, 0.85, 0.34, 0.985) : 0;
  return clamp(Math.max(edge, interior) * (1 - Math.max(title, footer, logo)));
}

const random = (n: number) => {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const point = (col: number, row: number): [number, number] => [
  col * 88 + (random(col + row * 31) - 0.5) * 62,
  row * 105 + (random(col * 13 + row * 7) - 0.5) * 75,
];
export function foilFacetVertices(col: number, row: number): [number, number][] {
  return [point(col, row), point(col + 1, row), point(col + (row % 2 ? 1 : 0), row + 1)];
}

export function createMvpMaterialPainter(
  canvas: HTMLCanvasElement,
  tier: Tier,
  series: CardSeries,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法显示反光效果');
  const mask = document.createElement('canvas');
  mask.width = canvas.width;
  mask.height = canvas.height;
  const mc = mask.getContext('2d')!;
  const pixels = mc.createImageData(mask.width, mask.height);
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      const i = (y * mask.width + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = Math.round(
        materialCoverage(x / mask.width, y / mask.height, series) * 255,
      );
    }
  mc.putImageData(pixels, 0, 0);
  const texture = document.createElement('canvas');
  texture.width = 1000;
  texture.height = 1400;
  const tc = texture.getContext('2d')!;
  if (tier === 'gold') {
    tc.fillStyle = '#6e4210';
    tc.fillRect(0, 0, 1000, 1400);
    for (let row = -1; row < 17; row++)
      for (let col = -1; col < 13; col++) {
        const x = col * 88 + (row % 2) * 44,
          y = row * 88;
        for (let r = 3; r < 62; r += 3) {
          tc.beginPath();
          tc.arc(x, y, r, 0, Math.PI * 2);
          tc.strokeStyle = r % 6 === 3 ? '#edc574' : '#3f250a';
          tc.lineWidth = r % 6 === 3 ? 1.1 : 1.7;
          tc.stroke();
        }
      }
  } else if (tier === 'silver') {
    for (let i = -1400; i < 1400; i += 3) {
      tc.strokeStyle = i % 9 === 0 ? '#eff5fd55' : '#73839733';
      tc.lineWidth = 0.7;
      tc.beginPath();
      tc.moveTo(i, 0);
      tc.lineTo(i + 620, 1400);
      tc.stroke();
    }
  }
  return (light = MATERIAL_REST) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (tier === 'base') return;
    ctx.save();
    ctx.scale(canvas.width / 1000, canvas.height / 1400);
    if (tier === 'gold') {
      ctx.globalAlpha = 0.77;
      ctx.drawImage(texture, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'screen';
    }
    if (tier === 'prism') {
      for (let row = -1; row < 15; row++)
        for (let col = -1; col < 13; col++) {
          const a = point(col, row),
            b = point(col + 1, row),
            c = point(col + 1, row + 1),
            d = point(col, row + 1);
          for (const [index, vertices] of [
            [a, b, d],
            [b, c, d],
          ].entries()) {
            const seed = col + row * 41 + index * 13;
            const shine = Math.pow(
              Math.max(0, Math.cos(random(seed) * Math.PI * 2 + light.x * 2.8 + light.y * 1.8)),
              5,
            );
            const hue = 180 + random(seed) * 110 + light.x * 25 + light.y * 20;
            ctx.fillStyle = `hsla(${hue},90%,${35 + shine * 48}%,${0.22 + shine * 0.64})`;
            ctx.strokeStyle = `hsla(${hue},95%,80%,${0.12 + shine * 0.58})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            vertices.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }
    }
    if (tier === 'prism') {
      for (let i = 0; i < 18; i++) {
        const x = i % 2 ? 930 - random(i) * 90 : 25 + random(i) * 100,
          y = 50 + random(i + 43) * 1300;
        const shine = Math.pow(Math.max(0, Math.sin(i * 2.4 + light.x * 3 + light.y * 2)), 7);
        const radius = 4 + shine * 16;
        ctx.fillStyle = `rgba(239,255,255,${shine * 0.94})`;
        ctx.beginPath();
        ctx.moveTo(x - radius, y);
        ctx.lineTo(x - 1.8, y - 1.8);
        ctx.lineTo(x, y - radius);
        ctx.lineTo(x + 1.8, y - 1.8);
        ctx.lineTo(x + radius, y);
        ctx.lineTo(x + 1.8, y + 1.8);
        ctx.lineTo(x, y + radius);
        ctx.lineTo(x - 1.8, y + 1.8);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (tier === 'silver') {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(texture, 0, 0);
      ctx.globalAlpha = 1;
    }
    const cx = 500 + light.x * 430,
      cy = 600 + light.y * 550;
    const band = ctx.createLinearGradient(cx - 600, cy - 350, cx + 600, cy + 350);
    const color =
      tier === 'gold' ? '255,209,115' : tier === 'obsidian' ? '150,138,204' : '231,242,255';
    band.addColorStop(0, `rgba(${color},0)`);
    band.addColorStop(0.27, `rgba(${color},.035)`);
    band.addColorStop(0.41, `rgba(${color},${tier === 'obsidian' ? 0.14 : 0.48})`);
    band.addColorStop(0.46, `rgba(${color},.04)`);
    band.addColorStop(0.51, `rgba(${color},${tier === 'obsidian' ? 0.26 : 0.85})`);
    band.addColorStop(0.56, `rgba(${color},.08)`);
    band.addColorStop(0.72, `rgba(${color},.22)`);
    band.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, 1000, 1400);
    ctx.restore();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  };
}
