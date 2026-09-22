import type { CardSeries } from './mvp-card';
const TAU = Math.PI * 2;
const smooth = (a: number, b: number, v: number) => {
  const x = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
export function motionFrame(series: CardSeries, seconds: number) {
  const duration = series === 'aura' ? 12 : series === 'animation' ? 6 : 10;
  const phase = (((seconds % duration) + duration) % duration) / duration;
  return { duration, phase, angle: phase * TAU, breath: 0.5 - 0.5 * Math.cos(phase * TAU) };
}
/** Soft conservative protection, not an inferred person segmentation mask. */
export function motionCoverage(x: number, y: number) {
  const safe = smooth(0.15, 0.21, y) * (1 - smooth(0.82, 0.88, y));
  const radius = Math.hypot((x - 0.5) / 0.24, (y - 0.53) / 0.34);
  return safe * smooth(0.8, 1.4, radius);
}
export function createSeriesMotionPainter(canvas: HTMLCanvasElement, series: CardSeries) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('动画画布不可用');
  const mask = document.createElement('canvas');
  mask.width = canvas.width;
  mask.height = canvas.height;
  const mc = mask.getContext('2d')!,
    pixels = mc.createImageData(mask.width, mask.height);
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      const i = (y * mask.width + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = Math.round(255 * motionCoverage(x / mask.width, y / mask.height));
    }
  mc.putImageData(pixels, 0, 0);
  function glow(x: number, y: number, r: number, color: string, alpha: number) {
    const gradient = ctx!.createRadialGradient(x, y, 1, x, y, r);
    gradient.addColorStop(0, `rgba(${color},${alpha})`);
    gradient.addColorStop(0.4, `rgba(${color},${alpha * 0.28})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    ctx!.fillStyle = gradient;
    ctx!.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return (seconds: number, intensity = 1, pointer = { x: 0, y: 0 }) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (series === 'classic') return;
    const { angle, breath } = motionFrame(series, seconds);
    ctx.save();
    ctx.scale(canvas.width / 1000, canvas.height / 1400);
    ctx.globalAlpha = Math.max(0, Math.min(1.5, intensity)) * 0.8;
    ctx.globalCompositeOperation = 'screen';
    if (series === 'aura') {
      // Slow celestial halo; the original artwork stays rigid and readable.
      const cx = 500 + pointer.x * 16,
        cy = 510 + pointer.y * 12;
      glow(
        190 + Math.sin(angle) * 90,
        690 + Math.cos(angle) * 140,
        390,
        '244,77,39',
        0.24 + breath * 0.16,
      );
      glow(810 + Math.cos(angle) * 45, 430 + Math.sin(angle) * 110, 360, '255,190,109', 0.23);
      for (let k = 0; k < 3; k++) {
        const radius = 310 + k * 24 + Math.sin(angle + k) * 8;
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius, radius * 0.87, Math.sin(angle) * 0.08, 0, TAU);
        ctx.strokeStyle = `rgba(255,${160 + k * 25},${104 + k * 24},${0.13 + breath * 0.16})`;
        ctx.lineWidth = k === 0 ? 3.3 : 1;
        ctx.shadowColor = '#ff8c4d';
        ctx.shadowBlur = 22;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      for (let i = 0; i < 42; i++) {
        const seed = i * 2.39996,
          r = 270 + (i % 9) * 31;
        const x = cx + Math.cos(seed + angle * (i % 2 ? 1 : -1)) * r;
        const y = cy + Math.sin(seed + angle * (i % 2 ? 1 : -1)) * r * 1.18;
        const opacity = 0.16 + 0.48 * (0.5 + 0.5 * Math.sin(angle * 2 + seed));
        glow(x, y, 9 + (i % 3) * 4, '255,207,144', opacity);
        ctx.fillStyle = `rgba(255,233,196,${opacity})`;
        ctx.beginPath();
        ctx.arc(x, y, i % 4 === 0 ? 2 : 1, 0, TAU);
        ctx.fill();
      }
      // Thin orbital arc suggests depth instead of shaking the athlete.
      ctx.beginPath();
      ctx.ellipse(cx, 790, 430, 112, -0.35 + Math.sin(angle) * 0.07, angle, angle + Math.PI * 1.2);
      ctx.strokeStyle = 'rgba(255,188,113,.26)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else {
      // Cartoon portal: irregular contours with stepped, ink-like timing.
      const beat = Math.floor(seconds * 12) / 12,
        t = motionFrame('animation', beat).angle;
      const cx = 440 + pointer.x * 12,
        cy = 625 + pointer.y * 12;
      glow(cx, cy, 550, '129,255,40', 0.14 + breath * 0.12);
      for (let ring = 0; ring < 4; ring++) {
        ctx.beginPath();
        for (let j = 0; j <= 160; j++) {
          const a = (j / 160) * TAU,
            r = 330 + ring * 15 + Math.sin(a * 9 - t * 3 + ring) * 10 + Math.cos(a * 5 + t * 2) * 6;
          const x = cx + Math.cos(a) * r,
            y = cy + Math.sin(a) * r * 1.2;
          if (j) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = ring % 2 ? 'rgba(178,255,66,.60)' : 'rgba(43,237,178,.35)';
        ctx.lineWidth = ring === 0 ? 7 : 2.4;
        ctx.stroke();
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + t,
          r = 375 + 18 * Math.sin(t * 2 + i);
        const x = cx + Math.cos(a) * r,
          y = cy + Math.sin(a) * r * 1.2;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + t);
        ctx.strokeStyle = i % 3 ? '#b4ff68' : '#b5a0ff';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(7, 0);
        ctx.moveTo(0, -7);
        ctx.lineTo(0, 7);
        ctx.stroke();
        ctx.restore();
      }
      // One restrained, broad energy pulse each six-second loop; never strobing.
      const pulse = Math.pow(breath, 6);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + 0.2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 400, cy + Math.sin(a) * 460);
        ctx.lineTo(cx + Math.cos(a) * (425 + pulse * 65), cy + Math.sin(a) * (490 + pulse * 85));
        ctx.strokeStyle = `rgba(213,255,146,${pulse * 0.48})`;
        ctx.lineWidth = i % 3 === 0 ? 5 : 2;
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  };
}
