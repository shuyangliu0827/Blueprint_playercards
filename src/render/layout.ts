import type { Layout, CardData, TextStyle, Element, Effect, Tier } from './types';
import { assetUrl, loadImage } from '../platform/web';
import { createMaterialRenderer } from './webgl';
export function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}
export const graphemes = (text: string) =>
  Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text), (s) => s.segment);
function font(ctx: CanvasRenderingContext2D, style: TextStyle, size: number, layout: Layout) {
  const face = layout.fonts.find((f) => f.id === style.fontRef);
  if (!face) throw new Error(`Unknown font ${style.fontRef}`);
  ctx.font = `${style.fontWeight} ${size}px ${[face.family, ...face.fallbacks].map((f) => (f === 'sans-serif' ? f : `"${f}"`)).join(',')}`;
}
function width(ctx: CanvasRenderingContext2D, text: string, spacing: number) {
  return ctx.measureText(text).width + Math.max(0, graphemes(text).length - 1) * spacing;
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, spacing: number) {
  const lines: string[] = [];
  let line = '';
  for (const char of graphemes(text)) {
    if (char === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    if (line && width(ctx, line + char, spacing) > maxWidth) {
      lines.push(line);
      line = char;
    } else line += char;
  }
  if (line) lines.push(line);
  return lines;
}
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: TextStyle,
  w: number,
  h: number,
  layout: Layout,
) {
  let size = style.fontSize;
  let lines: string[] = [];
  const fits = () => {
    font(ctx, style, size, layout);
    lines = wrap(ctx, text, w, style.letterSpacing);
    return (
      lines.length <= style.maxLines &&
      lines.length * size * style.lineHeight <= h &&
      lines.every((l) => width(ctx, l, style.letterSpacing) <= w)
    );
  };
  if (fits()) return { size, lines };
  if (style.overflow.strategy === 'shrink') {
    while (size > (style.overflow.minFontSize ?? size)) {
      size = Math.max(style.overflow.minFontSize ?? size, size - 1);
      if (fits()) return { size, lines };
    }
    if (style.overflow.onExhausted === 'reject') throw new Error('文字超出配置区域，请调整版式');
  } else if (style.overflow.strategy === 'reject') throw new Error('文字超出配置区域');
  const count = Math.max(1, Math.min(style.maxLines, Math.floor(h / (size * style.lineHeight))));
  lines = lines.slice(0, count);
  const suffix = style.overflow.ellipsis ?? '…';
  let last = lines.at(-1) ?? '';
  while (last && width(ctx, last + suffix, style.letterSpacing) > w)
    last = graphemes(last).slice(0, -1).join('');
  lines[lines.length - 1] = last + suffix;
  return { size, lines };
}
export function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceW: number,
  sourceH: number,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: 'cover' | 'contain' | 'stretch' = 'cover',
  anchor = { x: 0.5, y: 0.5 },
) {
  if (fit === 'stretch') {
    ctx.drawImage(image, x, y, w, h);
    return;
  }
  const scale =
    fit === 'cover' ? Math.max(w / sourceW, h / sourceH) : Math.min(w / sourceW, h / sourceH);
  const dw = sourceW * scale,
    dh = sourceH * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(image, x + (w - dw) * anchor.x, y + (h - dh) * anchor.y, dw, dh);
  ctx.restore();
}
async function drawElement(
  ctx: CanvasRenderingContext2D,
  e: Element,
  data: CardData,
  art: CanvasImageSource,
  layout: Layout,
  effect: Effect,
  tier: Tier,
  includeMaterial: boolean,
) {
  const { x, y, w, h } = e.rect;
  ctx.save();
  ctx.globalAlpha = e.opacity;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((e.rotationDeg * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  if (e.clip) {
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, e.clip.radius);
    ctx.clip();
  }
  if (e.clip?.maskRef) {
    const layer = makeCanvas(Math.ceil(w), Math.ceil(h)),
      lc = layer.getContext('2d')!;
    await drawElement(
      lc,
      {
        ...e,
        rect: { x: 0, y: 0, w, h },
        rotationDeg: 0,
        opacity: 1,
        clip: { ...e.clip, maskRef: null },
      },
      data,
      art,
      layout,
      effect,
      tier,
      includeMaterial,
    );
    lc.globalCompositeOperation = 'destination-in';
    lc.drawImage(await loadImage(assetUrl(e.clip.maskRef)), 0, 0, w, h);
    ctx.drawImage(layer, 0, 0, w, h);
    ctx.restore();
    return;
  }
  if (e.type === 'shape' && e.shape) {
    const s = e.shape;
    ctx.beginPath();
    if (s.kind === 'ellipse') ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else ctx.roundRect(0, 0, w, h, s.radius);
    ctx.fillStyle = s.fill;
    ctx.fill();
    if (s.strokeWidth) {
      ctx.lineWidth = s.strokeWidth;
      ctx.strokeStyle = s.stroke;
      ctx.stroke();
    }
  }
  if (e.type === 'image' && e.image) {
    const image = e.image.source.assetRef
      ? await loadImage(assetUrl(e.image.source.assetRef))
      : art;
    const size = image as {
      width: number;
      height: number;
      naturalWidth?: number;
      naturalHeight?: number;
    };
    drawFittedImage(
      ctx,
      image,
      size.naturalWidth ?? size.width,
      size.naturalHeight ?? size.height,
      0,
      0,
      w,
      h,
      e.image.fit,
      e.image.anchor,
    );
  }
  if (e.type === 'text' && e.text) {
    const t = e.text,
      c = t.content;
    const value =
      c.literal ?? `${c.prefix ?? ''}${data[c.binding as keyof CardData] ?? ''}${c.suffix ?? ''}`;
    const tw = w - t.padding.left - t.padding.right,
      th = h - t.padding.top - t.padding.bottom;
    const fit = fitText(ctx, value, t, tw, th, layout);
    font(ctx, t, fit.size, layout);
    ctx.fillStyle = t.color;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const total = fit.lines.length * fit.size * t.lineHeight;
    let ty =
      t.padding.top +
      (t.verticalAlign === 'middle'
        ? (th - total) / 2
        : t.verticalAlign === 'bottom'
          ? th - total
          : 0);
    for (const line of fit.lines) {
      let tx =
        t.padding.left +
        (t.align === 'center'
          ? (tw - width(ctx, line, t.letterSpacing)) / 2
          : t.align === 'right'
            ? tw - width(ctx, line, t.letterSpacing)
            : 0);
      for (const char of graphemes(line)) {
        ctx.fillText(char, tx, ty);
        tx += ctx.measureText(char).width + t.letterSpacing;
      }
      ty += fit.size * t.lineHeight;
    }
  }
  if (e.type === 'material' && includeMaterial) {
    const m = effect.materials.find((m) => m.id === tier)!;
    const surface = makeCanvas(Math.round(w), Math.round(h));
    try {
      const renderer = await createMaterialRenderer(surface, m);
      renderer.draw(m.staticFallback.captureUniforms);
      ctx.drawImage(surface, 0, 0, w, h);
      renderer.dispose(true);
    } catch {
      const fallback = await loadImage(assetUrl(m.staticFallback.imageRef));
      ctx.drawImage(fallback, 0, 0, w, h);
    }
  }
  ctx.restore();
}
export async function renderCard(
  layout: Layout,
  effect: Effect,
  data: CardData,
  art: CanvasImageSource,
  tier: Tier,
  side: 'front' | 'back' = 'front',
  includeMaterial = true,
) {
  for (const face of layout.fonts)
    if (face.source) {
      const f = new FontFace(face.family, `url(${assetUrl(face.source)})`);
      await f.load();
      document.fonts.add(f);
    }
  await document.fonts.ready;
  const canvas = makeCanvas(layout.canvas.width, layout.canvas.height),
    ctx = canvas.getContext('2d')!;
  ctx.fillStyle = layout[side].backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const el of [...layout[side].elements].sort((a, b) => a.zIndex - b.zIndex))
    await drawElement(ctx, el, data, art, layout, effect, tier, includeMaterial);
  return canvas;
}
