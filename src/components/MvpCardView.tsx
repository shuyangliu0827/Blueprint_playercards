'use client';
import { useEffect, useRef, useState } from 'react';
import type { Tier } from '../render/types';
import type { CardSeries } from '../render/mvp-card';
import { createMvpMaterialPainter, MATERIAL_REST } from '../render/mvp-material';
import { bindOrientation } from '../platform/web';
import styles from './MvpCardView.module.css';

export type MvpCardViewProps = {
  front: string;
  back?: string;
  tier: Tier;
  series?: CardSeries;
  interactive?: boolean;
  forceStatic?: boolean;
};

export default function MvpCardView({
  front,
  back,
  tier,
  series = 'classic',
  interactive = true,
  forceStatic = false,
}: MvpCardViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null);
  const target = useRef({ ...MATERIAL_REST });
  const sensorCleanup = useRef<(() => void) | null>(null);
  const [flipped, setFlipped] = useState(false),
    [reduced, setReduced] = useState(false),
    [sensor, setSensor] = useState('');
  const still = forceStatic || reduced || !interactive;
  useEffect(() => {
    setFlipped(false);
  }, [front]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const surface = canvas.current,
      element = host.current;
    if (!surface || !element) return;
    let frame = 0;
    target.current = { ...MATERIAL_REST };
    // Canvas 2D is also the no-WebGL fallback. Rest state is the export snapshot.
    let paint: ReturnType<typeof createMvpMaterialPainter>;
    try {
      paint = createMvpMaterialPainter(surface, tier, series);
      paint();
    } catch {
      return;
    }
    const current = { ...MATERIAL_REST };
    let previous = 0;
    const tick = (time: number) => {
      frame = 0;
      if (document.hidden || still || flipped) return;
      const blend = 1 - Math.exp(-Math.min(64, time - previous) / 100);
      previous = time;
      current.x += (target.current.x - current.x) * blend;
      current.y += (target.current.y - current.y) * blend;
      paint(current);
      element.style.transform = `perspective(1000px) rotateX(${-current.y * 5}deg) rotateY(${current.x * 6}deg)`;
      if (Math.abs(current.x - target.current.x) + Math.abs(current.y - target.current.y) > 0.002)
        frame = requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (!frame && !still && !flipped) {
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      target.current = {
        x: Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1)),
      };
      schedule();
    };
    const rest = () => {
      target.current = { ...MATERIAL_REST };
      schedule();
    };
    const orientation = () => schedule();
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else schedule();
    };
    if (!still && !flipped) {
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerleave', rest);
      element.addEventListener('pointercancel', rest);
      window.addEventListener('deviceorientation', orientation);
      document.addEventListener('visibilitychange', visibility);
    }
    if (still || flipped) element.style.transform = 'none';
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', rest);
      element.removeEventListener('pointercancel', rest);
      window.removeEventListener('deviceorientation', orientation);
      document.removeEventListener('visibilitychange', visibility);
      element.style.transform = 'none';
      sensorCleanup.current?.();
      sensorCleanup.current = null;
    };
  }, [tier, series, front, still, flipped]);
  async function enableSensor() {
    try {
      sensorCleanup.current?.();
      sensorCleanup.current = await bindOrientation((v) => {
        if (v.source === 'orientation')
          target.current = {
            x: Math.max(-1, Math.min(1, v.rollDeg / 30)),
            y: Math.max(-1, Math.min(1, v.pitchDeg / 30)),
          };
      });
      setSensor('倾斜感应已开启');
    } catch {
      setSensor('此设备未开启倾斜感应，可以拖动查看反光');
    }
  }
  return (
    <div className={styles.wrapper}>
      <div ref={host} className={styles.surface} data-series={series} data-tier={tier}>
        <img
          className={styles.art}
          src={flipped && back ? back : front}
          alt={flipped ? '篮球卡背面' : '篮球卡正面'}
          draggable={false}
        />
        <canvas
          ref={canvas}
          width={600}
          height={840}
          className={styles.foil}
          aria-label={still ? '静态卡片反光' : '随指针或倾斜变化的卡片反光'}
          style={{ visibility: flipped ? 'hidden' : 'visible' }}
        />
      </div>
      {interactive && (
        <div className={styles.controls}>
          {back && (
            <button type="button" onClick={() => setFlipped((v) => !v)}>
              ↻ {flipped ? '查看正面' : '翻到卡背'}
            </button>
          )}
          {!still && tier !== 'base' && (
            <button type="button" onClick={enableSensor}>
              ◇ 开启倾斜感应
            </button>
          )}
          {tier !== 'base' && (
            <span role="status">
              {still ? '静态反光模式' : sensor || '移动指针或轻拖卡面，查看材质反光'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
