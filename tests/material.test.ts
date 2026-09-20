import { describe, it, expect } from 'vitest';
import { evaluateCurve, mapInputToUniforms, FpsMonitor } from '../src/render/material-input';
import effect from '../config/effect.json';
import type { Material } from '../src/render/types';
describe('platform independent material input', () => {
  it('clamps and interpolates a piecewise curve', () => {
    const c = {
      kind: 'piecewise-linear' as const,
      points: [
        [-30, -0.8],
        [0, 0],
        [30, 0.8],
      ],
      outside: 'clamp' as const,
    };
    expect(evaluateCurve(c, -100)).toBe(-0.8);
    expect(evaluateCurve(c, 15)).toBeCloseTo(0.4);
    expect(evaluateCurve(c, NaN)).toBe(0);
  });
  it('inverts cubic Bezier x rather than treating x as time', () => {
    const c = {
      kind: 'cubic-bezier' as const,
      inputRange: [0, 1],
      outputRange: [0, 1],
      controlPoints: [0.42, 0, 0.58, 1],
      outside: 'clamp' as const,
    };
    expect(evaluateCurve(c, 0.5)).toBeCloseTo(0.5, 4);
    expect(evaluateCurve(c, 0.25)).toBeLessThan(0.25);
  });
  it('uses only selected source without mutating config', () => {
    const m = effect.materials[2] as Material;
    const out = mapInputToUniforms(m, { source: 'pointer', x: 1, y: -1 });
    expect(out.tiltX).toBe(0.8);
    expect(out.tiltY).toBe(-0.8);
    expect(m.uniforms.tiltX).toBe(0.2);
    const o = mapInputToUniforms(m, { source: 'orientation', pitchDeg: 15, rollDeg: -30 });
    expect(o.tiltY).toBeCloseTo(0.4);
    expect(o.tiltX).toBe(-0.8);
  });
  it('requires consecutive low FPS windows and ignores hidden time', () => {
    const m = new FpsMonitor({
      threshold: 24,
      sampleWindowMs: 1000,
      consecutiveWindows: 2,
      warmupMs: 0,
      ignoreWhenHidden: true,
    });
    for (let t = 0; t <= 1000; t += 100) expect(m.frame(t, false)).toBe(false);
    expect(m.frame(10000, true)).toBe(false);
    for (let t = 10100; t < 12100; t += 100) expect(m.frame(t, false)).toBe(false);
    expect(m.frame(12100, false)).toBe(true);
  });
});
