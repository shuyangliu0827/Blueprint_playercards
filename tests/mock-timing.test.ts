import { describe, expect, it } from 'vitest';
import { mockLatencyMs } from '../src/core/mock-timing.js';

describe('mock timing inverse CDF', () => {
  it('pins the required quantiles and remains continuous and monotonic', () => {
    expect(mockLatencyMs(0.5, 'normal')).toBe(12_000);
    expect(mockLatencyMs(0.95, 'normal')).toBe(40_000);
    const samples = Array.from({ length: 1001 }, (_, i) => mockLatencyMs(i / 1000, 'normal'));
    expect(samples.every((value, i) => i === 0 || value >= samples[i - 1]!)).toBe(true);
    expect(mockLatencyMs(0.500001, 'normal') - mockLatencyMs(0.5, 'normal')).toBeLessThan(10);
    expect(mockLatencyMs(0.950001, 'normal') - mockLatencyMs(0.95, 'normal')).toBeLessThan(10);
  });
  it('uses the exact fast review delay and rejects invalid entropy', () => {
    expect(mockLatencyMs(0, 'fast')).toBe(500);
    expect(mockLatencyMs(1, 'fast')).toBe(500);
    expect(() => mockLatencyMs(-0.1, 'normal')).toThrow(/within/);
  });
  it('uses deployment timing parameters', () => {
    const config = { p50: 1_000, p95: 5_000, fast: 75 };
    expect(mockLatencyMs(0.5, 'normal', config)).toBe(1_000);
    expect(mockLatencyMs(0.95, 'normal', config)).toBe(5_000);
    expect(mockLatencyMs(0.2, 'fast', config)).toBe(75);
  });
});
