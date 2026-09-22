import { describe, it, expect } from 'vitest';
import { motionFrame, motionCoverage } from '../src/render/series-motion';
describe('series animation contract', () => {
  it('has seamless deterministic loops and distinct timing', () => {
    for (const series of ['classic', 'aura', 'animation'] as const) {
      const a = motionFrame(series, 0),
        b = motionFrame(series, a.duration);
      expect(b.phase).toBeCloseTo(a.phase, 8);
      expect(b.breath).toBeCloseTo(a.breath, 8);
      expect(motionFrame(series, 1).phase).not.toEqual(a.phase);
    }
    expect(motionFrame('aura', 0).duration).not.toEqual(motionFrame('animation', 0).duration);
  });
  it('protects name, heading and central athlete while lighting the backdrop', () => {
    expect(motionCoverage(0.5, 0.5)).toBe(0);
    expect(motionCoverage(0.5, 0.94)).toBe(0);
    expect(motionCoverage(0.8, 0.08)).toBe(0);
    expect(motionCoverage(0.12, 0.5)).toBeGreaterThan(0.5);
  });
});
