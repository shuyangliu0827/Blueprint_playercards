import type { CardData, Tier } from './types';
import { loadImage } from '../platform/web';
import { createMvpMaterialPainter, fitArtwork, MVP_HEIGHT, MVP_WIDTH } from './mvp-material';

export type CardSeries = 'classic' | 'aura' | 'animation';
const FONT = '"Arial Black", "PingFang SC", "Microsoft YaHei", sans-serif';
const SERIF = '"Baskerville", "Songti SC", Georgia, serif';
function chrome(ctx: CanvasRenderingContext2D, y: number, h: number, tier: Tier) {
  const g = ctx.createLinearGradient(0, y, 30, y + h);
  const gold = tier === 'gold';
  [
    '#1b202a',
    gold ? '#e7c782' : '#aab4c0',
    gold ? '#fff2bd' : '#ffffff',
    gold ? '#806024' : '#55616e',
    gold ? '#ebd399' : '#e4eaf1',
    '#343943',
  ].forEach((c, i) => g.addColorStop(i / 5, c));
  return g;
}
function polygon(
  ctx: CanvasRenderingContext2D,
  points: number[][],
  fill: string | CanvasGradient,
  stroke?: string | CanvasGradient,
  lineWidth = 2,
) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x!, y!) : ctx.moveTo(x!, y!)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}
function nameText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  series: CardSeries,
  fill: string | CanvasGradient,
) {
  ctx.textAlign = series === 'aura' ? 'center' : 'left';
  ctx.textBaseline = 'alphabetic';
  const font = (s: number) =>
    `${series === 'aura' ? '500' : 'italic 900'} ${s}px ${series === 'aura' ? SERIF : FONT}`;
  ctx.font = font(size);
  while (ctx.measureText(text).width > maxWidth && size > 18) {
    size--;
    ctx.font = font(size);
  }
  ctx.fillStyle = fill;
  ctx.shadowColor = '#000b';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  ctx.fillText(text, x, y, maxWidth);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}
function dimensions(source: CanvasImageSource) {
  if ('naturalWidth' in source) return [source.naturalWidth, source.naturalHeight];
  if ('videoWidth' in source) return [source.videoWidth, source.videoHeight];
  if ('displayWidth' in source) return [source.displayWidth, source.displayHeight];
  return [Number(source.width), Number(source.height)];
}

/** The generated image supplies only artwork; template geometry, brand and personal text are local. */
export async function renderMvpCard({
  artwork,
  data,
  series,
  tier,
  includeMaterial = false,
}: {
  artwork: CanvasImageSource;
  data: CardData;
  series: CardSeries;
  tier: Tier;
  includeMaterial?: boolean;
}): Promise<HTMLCanvasElement> {
  const logo = await loadImage('/assets/brand/blueprint-logo.png');
  if (document.fonts) await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = MVP_WIDTH;
  canvas.height = MVP_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('此浏览器无法绘制卡片');
  ctx.fillStyle = '#080c12';
  ctx.fillRect(0, 0, 1000, 1400);
  const [sw, sh] = dimensions(artwork);
  if (!sw || !sh) throw new Error('作品图片为空');
  // A blurred bleed fills the frame while contain fitting retains the entire supplied pose.
  const bleed = Math.max(1000 / sw, 1400 / sh);
  ctx.save();
  ctx.filter = 'blur(24px) brightness(.52)';
  ctx.drawImage(artwork, (1000 - sw * bleed) / 2, (1400 - sh * bleed) / 2, sw * bleed, sh * bleed);
  ctx.restore();
  const artBox = { x: 20, y: 20, w: 960, h: 1360 };
  const art = fitArtwork(sw, sh, artBox);
  ctx.drawImage(artwork, art.x, art.y, art.w, art.h);
  const shade = ctx.createLinearGradient(0, 1050, 0, 1400);
  shade.addColorStop(0, '#05090e00');
  shade.addColorStop(0.55, '#05090e99');
  shade.addColorStop(1, '#05090e');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 1050, 1000, 350);
  const metal = chrome(ctx, 0, 1400, tier),
    accent = series === 'animation' ? '#aff562' : series === 'aura' ? '#e6b69d' : '#d62e36';

  if (series === 'classic') {
    // Sweeping machined side rails, slim enough to keep the athlete and ball visible.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(46, 0);
    ctx.bezierCurveTo(-14, 520, 68, 870, 260, 1185);
    ctx.lineTo(330, 1230);
    ctx.lineTo(215, 1230);
    ctx.bezierCurveTo(16, 930, -5, 420, 0, 0);
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.bezierCurveTo(-5, 470, 54, 880, 304, 1225);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = '#ffb5a7';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    for (let i = 0; i < 13; i++) {
      ctx.beginPath();
      ctx.moveTo(10 + i * 2, 0);
      ctx.bezierCurveTo(-45 + i * 3, 570, 25 + i * 3, 950, 215 + i * 5, 1220);
      ctx.strokeStyle = i % 2 ? '#ffffff66' : '#141a20';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(959, 0);
    ctx.lineTo(980, 0);
    ctx.lineTo(980, 1140);
    ctx.quadraticCurveTo(980, 1300, 855, 1345);
    ctx.lineTo(800, 1380);
    ctx.lineTo(755, 1380);
    ctx.quadraticCurveTo(957, 1290, 957, 1140);
    ctx.closePath();
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(951, 0);
    ctx.lineTo(951, 1140);
    ctx.quadraticCurveTo(951, 1280, 826, 1325);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 7;
    ctx.stroke();
    polygon(
      ctx,
      [
        [0, 1245],
        [75, 1200],
        [670, 1200],
        [786, 1337],
        [708, 1372],
        [0, 1372],
      ],
      metal,
      '#f5f8fa',
      2,
    );
    polygon(
      ctx,
      [
        [0, 1275],
        [85, 1215],
        [658, 1215],
        [760, 1334],
        [701, 1355],
        [0, 1355],
      ],
      '#080a0d',
      '#485057',
      2,
    );
    polygon(
      ctx,
      [
        [40, 1239],
        [85, 1222],
        [655, 1222],
        [667, 1239],
      ],
      accent,
    );
    ctx.fillStyle = '#d0d7df';
    ctx.font = `600 17px ${FONT}`;
    ctx.fillText('BLUEPRINT  /  PLAYER EDITION', 75, 62);
  } else if (series === 'aura') {
    ctx.strokeStyle = metal;
    ctx.lineWidth = 8;
    ctx.strokeRect(15, 15, 970, 1370);
    ctx.strokeStyle = '#efd5bb';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(26, 26, 948, 1348);
    for (const [x, y, sx, sy] of [
      [27, 27, 1, 1],
      [973, 27, -1, 1],
      [27, 1373, 1, -1],
      [973, 1373, -1, -1],
    ]) {
      polygon(
        ctx,
        [
          [x!, y!],
          [x! + sx! * 95, y!],
          [x!, y! + sy! * 95],
        ],
        '#16171b',
        metal,
        2,
      );
      ctx.beginPath();
      ctx.moveTo(x! + sx! * 14, y! + sy! * 80);
      ctx.lineTo(x! + sx! * 80, y! + sy! * 14);
      ctx.strokeStyle = '#eed6bd';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.font = `500 185px ${SERIF}`;
    ctx.textAlign = 'center';
    const auraChrome = ctx.createLinearGradient(0, 40, 0, 190);
    auraChrome.addColorStop(0, '#fff4df');
    auraChrome.addColorStop(0.42, '#dbbca2');
    auraChrome.addColorStop(0.5, '#fff5e2');
    auraChrome.addColorStop(0.54, '#8e807c');
    auraChrome.addColorStop(1, '#f8dec4');
    ctx.fillStyle = auraChrome;
    ctx.fillText('AURA', 500, 184);
    ctx.strokeStyle = '#f5d9bc99';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(500, 163, 392, 38, -0.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff0d7';
    for (const [x, y] of [
      [105, 183],
      [864, 127],
      [332, 1269],
      [668, 1269],
    ]) {
      polygon(
        ctx,
        [
          [x! - 2, y! - 14],
          [x! + 2, y! - 2],
          [x! + 14, y!],
          [x! + 2, y! + 2],
          [x!, y! + 14],
          [x! - 2, y! + 2],
          [x! - 14, y!],
        ],
        '#fff0d7',
      );
    }
  } else {
    polygon(
      ctx,
      [
        [0, 35],
        [35, 0],
        [225, 0],
        [248, 24],
        [755, 24],
        [780, 0],
        [965, 0],
        [1000, 35],
        [1000, 1360],
        [960, 1400],
        [42, 1400],
        [0, 1358],
      ],
      metal,
      '#d9faf9',
      3,
    );
    polygon(
      ctx,
      [
        [20, 46],
        [48, 20],
        [219, 20],
        [243, 44],
        [764, 44],
        [788, 20],
        [951, 20],
        [980, 49],
        [980, 1346],
        [946, 1378],
        [54, 1378],
        [20, 1347],
      ],
      '#0d1724',
      '#78d6cc',
      3,
    );
    // Restore the artwork window after drawing the continuous outer shell.
    ctx.drawImage(artwork, art.x, art.y, art.w, art.h);
    ctx.save();
    ctx.translate(500, 160);
    ctx.transform(1, -0.025, -0.09, 1, 0, 0);
    ctx.font = `italic 900 113px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#161025';
    ctx.strokeText('ANIMATION', 0, 0, 876);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#917efb';
    ctx.strokeText('ANIMATION', 0, 0, 876);
    const slime = ctx.createLinearGradient(0, -90, 0, 5);
    slime.addColorStop(0, '#bcff7c');
    slime.addColorStop(0.5, '#7ceba8');
    slime.addColorStop(1, '#69c7fb');
    ctx.fillStyle = slime;
    ctx.fillText('ANIMATION', 0, 0, 876);
    ctx.restore();
    polygon(
      ctx,
      [
        [284, 1290],
        [329, 1230],
        [839, 1230],
        [865, 1254],
        [942, 1254],
        [971, 1284],
        [971, 1350],
        [921, 1372],
        [281, 1372],
      ],
      metal,
      '#99f4cf',
      4,
    );
    polygon(
      ctx,
      [
        [305, 1295],
        [344, 1249],
        [829, 1249],
        [854, 1271],
        [930, 1271],
        [951, 1290],
        [951, 1337],
        [915, 1352],
        [305, 1352],
      ],
      '#e1e7e9',
      '#122030',
      3,
    );
  }
  // Material never touches the protected type/logo zones; exactly the same painter drives the preview.
  if (includeMaterial) {
    const overlay = document.createElement('canvas');
    overlay.width = 1000;
    overlay.height = 1400;
    createMvpMaterialPainter(overlay, tier, series)();
    ctx.drawImage(overlay, 0, 0);
  }
  if (series === 'classic') {
    const lettering = ctx.createLinearGradient(0, 1240, 0, 1310);
    lettering.addColorStop(0, '#ffffff');
    lettering.addColorStop(0.5, '#f6f7f9');
    lettering.addColorStop(0.56, '#a5afb9');
    lettering.addColorStop(1, '#edf3fa');
    nameText(ctx, data.nickname, 75, 1302, 575, 70, series, lettering);
    ctx.textAlign = 'left';
    ctx.font = `italic 800 27px ${FONT}`;
    ctx.fillStyle = '#bdc9d4';
    ctx.fillText(`NO. ${data.jerseyNumber.padStart(2, '0')}`, 79, 1342);
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = '#bfc7d0';
    ctx.textAlign = 'right';
    ctx.fillText(data.position.toUpperCase(), 690, 1340);
    ctx.drawImage(logo, 694, 44, 258, 129);
  } else if (series === 'aura') {
    nameText(ctx, data.nickname, 500, 1300, 760, 52, series, '#f6e4c5');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e5cfa9';
    ctx.font = `500 24px ${SERIF}`;
    ctx.fillText(
      `NO. ${data.jerseyNumber.padStart(2, '0')}   ·   ${data.position.toUpperCase()}`,
      500,
      1344,
    );
    ctx.drawImage(logo, 761, 38, 196, 98);
  } else {
    nameText(ctx, data.nickname, 342, 1321, 480, 61, series, '#101322');
    ctx.textAlign = 'right';
    ctx.font = `italic 900 23px ${FONT}`;
    ctx.fillStyle = '#101322';
    ctx.fillText(`NO. ${data.jerseyNumber.padStart(2, '0')}`, 927, 1335);
    ctx.drawImage(logo, 36, 1248, 249, 124.5);
  }
  ctx.textAlign = 'left';
  return canvas;
}
