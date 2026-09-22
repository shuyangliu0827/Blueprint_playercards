import type { CardSeries } from '../render/mvp-card';
import type { Tier } from '../render/types';
import { createMvpMaterialPainter, MATERIAL_REST } from '../render/mvp-material';
import { createSeriesMotionPainter } from '../render/series-motion';
export type CardMotionOptions = {
  series: CardSeries;
  tier?: Tier;
  material?: boolean;
  tilt?: boolean;
  playing?: boolean;
  intensity?: number;
};
/** DOM-only adapter: shared unchanged by standalone gallery and React. No network or image dependency. */
export function mountCardMotion(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  options: CardMotionOptions,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('浏览器无法显示卡面动画');
  const layer = document.createElement('canvas');
  layer.width = canvas.width;
  layer.height = canvas.height;
  const paintSeries = createSeriesMotionPainter(layer, options.series);
  const paintFoil =
    options.material === false
      ? null
      : createMvpMaterialPainter(canvas, options.tier ?? 'silver', options.series);
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let playing = options.playing ?? true,
    intensity = options.intensity ?? 1,
    visible = true,
    disposed = false,
    frame = 0,
    last = 0,
    seconds = 0;
  const pointer = { ...MATERIAL_REST };
  function draw() {
    if (paintFoil)
      paintFoil({
        x: pointer.x + Math.sin(seconds * 0.45) * 0.45,
        y: pointer.y + Math.cos(seconds * 0.45) * 0.3,
      });
    else ctx!.clearRect(0, 0, canvas.width, canvas.height);
    paintSeries(seconds, intensity, pointer);
    ctx!.drawImage(layer, 0, 0);
    if (options.tilt)
      host.style.transform = media.matches
        ? 'none'
        : `perspective(1100px) rotateX(${-pointer.y * 4}deg) rotateY(${pointer.x * 5}deg)`;
  }
  function active() {
    return playing && !media.matches && visible && !document.hidden && !disposed;
  }
  function tick(time: number) {
    frame = 0;
    if (!active()) {
      last = 0;
      return;
    }
    if (!last || time - last >= 1000 / 30) {
      seconds += last ? Math.min(0.08, (time - last) / 1000) : 0;
      last = time;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    if (!disposed) {
      draw();
      if (active()) frame = requestAnimationFrame(tick);
    }
  }
  function move(event: PointerEvent) {
    if (media.matches || !playing) return;
    const box = host.getBoundingClientRect();
    pointer.x = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1));
    pointer.y = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1));
  }
  function rest() {
    Object.assign(pointer, MATERIAL_REST);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      sync();
    },
    { rootMargin: '80px' },
  );
  observer.observe(host);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerleave', rest);
  host.addEventListener('pointercancel', rest);
  document.addEventListener('visibilitychange', sync);
  media.addEventListener('change', sync);
  sync();
  return {
    setPlaying(value: boolean) {
      playing = value;
      sync();
    },
    setIntensity(value: number) {
      intensity = Math.max(0, Math.min(1.5, value));
      draw();
    },
    seek(value: number) {
      seconds = Math.max(0, value);
      draw();
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', rest);
      host.removeEventListener('pointercancel', rest);
      document.removeEventListener('visibilitychange', sync);
      media.removeEventListener('change', sync);
      if (options.tilt) host.style.transform = '';
      ctx!.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
