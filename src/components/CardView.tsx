'use client';
import { useEffect, useRef, useState } from 'react';
import effectJson from '../../config/effect.json';
import layoutJson from '../../config/layout.json';
import type { Effect, Layout, Tier, Uniforms } from '../render/types';
import { createMaterialRenderer, type MaterialRenderer } from '../render/webgl';
import { FpsMonitor, mapInputToUniforms } from '../render/material-input';
import { assetUrl, bindPointer, bindOrientation } from '../platform/web';
const effect = effectJson as Effect,
  layout = layoutJson as Layout;
export default function CardView({
  front,
  back,
  tier = 'prism',
  interactive = true,
  forceStatic = false,
}: {
  front: string;
  back?: string;
  tier?: Tier;
  interactive?: boolean;
  forceStatic?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null),
    renderer = useRef<MaterialRenderer | null>(null),
    target = useRef<Uniforms>(effect.materials[0]!.uniforms),
    orientationCleanup = useRef<(() => void) | null>(null);
  const [flipped, setFlipped] = useState(false),
    [fallback, setFallback] = useState(forceStatic),
    [sensor, setSensor] = useState('');
  const material = effect.materials.find((m) => m.id === tier)!;
  const rect = layout.front.elements.find((e) => e.type === 'material')!.rect;
  useEffect(() => {
    setFlipped(false);
  }, [front]);
  useEffect(() => {
    let stopped = false,
      frame = 0,
      unbind: () => void = () => {};
    setFallback(forceStatic);
    target.current = material.uniforms;
    if (forceStatic || !canvas.current || !host.current) return;
    const monitor = new FpsMonitor(effect.fallbackPolicy.lowFps);
    const element = canvas.current;
    let last = 0,
      current = { ...material.uniforms };
    const lost = (e: Event) => {
      e.preventDefault();
      setFallback(true);
      cancelAnimationFrame(frame);
    };
    element.addEventListener('webglcontextlost', lost);
    void createMaterialRenderer(element, material)
      .then((r) => {
        if (stopped) {
          r.dispose();
          return;
        }
        renderer.current = r;
        unbind = bindPointer(
          host.current!,
          (v) => {
            target.current = mapInputToUniforms(material, v);
          },
          () => {
            target.current = material.uniforms;
          },
        );
        const tick = (now: number) => {
          if (stopped) return;
          if (monitor.frame(now, document.hidden)) {
            setFallback(true);
            r.dispose();
            renderer.current = null;
            return;
          }
          const blend =
            1 - Math.exp(-Math.min(100, now - last) / Math.max(1, effect.input.smoothingMs));
          last = now;
          current = {
            ...target.current,
            tiltX: current.tiltX + (target.current.tiltX - current.tiltX) * blend,
            tiltY: current.tiltY + (target.current.tiltY - current.tiltY) * blend,
          };
          if (!document.hidden) r.draw(current);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      })
      .catch(() => setFallback(true));
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      unbind();
      element.removeEventListener('webglcontextlost', lost);
      renderer.current?.dispose();
      renderer.current = null;
      orientationCleanup.current?.();
      orientationCleanup.current = null;
    };
  }, [tier, forceStatic, front, material]);
  async function enableSensor() {
    try {
      orientationCleanup.current?.();
      orientationCleanup.current = await bindOrientation((v) => {
        target.current = mapInputToUniforms(material, v);
      });
      setSensor('倾斜感应已开启');
    } catch {
      setSensor('可以直接拖动卡片查看反光');
    }
  }
  return (
    <div className="card-view">
      <div className="card-perspective" ref={host}>
        <div className={`card-flipper ${flipped ? 'is-flipped' : ''}`}>
          <div className="card-face card-front">
            <img src={front} alt="篮球卡正面" draggable={false} />
            <div
              className="foil-surface"
              style={{
                left: `${(rect.x / layout.canvas.width) * 100}%`,
                top: `${(rect.y / layout.canvas.height) * 100}%`,
                width: `${(rect.w / layout.canvas.width) * 100}%`,
                height: `${(rect.h / layout.canvas.height) * 100}%`,
              }}
            >
              <canvas
                width={702}
                height={1002}
                ref={canvas}
                aria-label={`${material.label}动态反光`}
                style={{ display: fallback ? 'none' : 'block' }}
              />
              {fallback && <img src={assetUrl(material.staticFallback.imageRef)} alt="静态反光" />}
            </div>
          </div>
          {back && (
            <div className="card-face card-back">
              <img src={back} alt="篮球卡背面" draggable={false} />
            </div>
          )}
        </div>
      </div>
      {interactive && (
        <div className="card-controls">
          {back && (
            <button type="button" onClick={() => setFlipped(!flipped)}>
              ↻ {flipped ? '查看正面' : '翻到卡背'}
            </button>
          )}
          <button type="button" onClick={enableSensor}>
            ◇ 开启倾斜感应
          </button>
          <span>{fallback ? '静态反光模式' : sensor || '拖动卡面，看看光怎么走。'}</span>
        </div>
      )}
    </div>
  );
}
