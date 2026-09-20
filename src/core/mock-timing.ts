export type MockMode = 'normal' | 'fast';
export interface MockTimingConfig {
  readonly p50: number;
  readonly p95: number;
  readonly fast: number;
}
const defaults: MockTimingConfig = { p50: 12_000, p95: 40_000, fast: 500 };

/** Inverse CDF for the review mock. The curve is continuous and pins P50/P95. */
export function mockLatencyMs(
  unit: number,
  mode: MockMode,
  config: MockTimingConfig = defaults,
): number {
  if (!Number.isFinite(unit) || unit < 0 || unit > 1)
    throw new Error('mock timing random value must be within [0, 1]');
  if (
    ![config.p50, config.p95, config.fast].every((value) => Number.isInteger(value) && value > 0) ||
    config.p95 <= config.p50
  )
    throw new Error('mock timing config is invalid');
  if (mode === 'fast') return config.fast;
  if (mode !== 'normal') throw new Error('unknown mock timing mode');
  const floor = Math.max(1, Math.round(config.p50 / 3));
  if (unit <= 0.5) return Math.round(floor + ((config.p50 - floor) / 0.5) * unit);
  if (unit <= 0.95)
    return Math.round(config.p50 + ((unit - 0.5) / 0.45) * (config.p95 - config.p50));
  return Math.round(config.p95 + ((unit - 0.95) / 0.05) * (config.p95 / 2));
}
