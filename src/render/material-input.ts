import type { Curve, Material, Uniforms, Effect } from './types';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function evaluateCurve(curve: Curve, input: number): number {
  const x = Number.isFinite(input) ? input : 0;
  if (curve.kind === 'piecewise-linear') {
    const points = curve.points;
    if (x <= points[0]![0]!) return points[0]![1]!;
    for (let i = 1; i < points.length; i++) {
      const [a, b] = points[i - 1]!;
      const [c, d] = points[i]!;
      if (x <= c!) return b! + ((d! - b!) * (x - a!)) / (c! - a!);
    }
    return points.at(-1)![1]!;
  }
  const [a, b] = curve.inputRange;
  const f = clamp((x - a!) / (b! - a!), 0, 1);
  const [x1, y1, x2, y2] = curve.controlPoints;
  const cubic = (t: number, p: number, q: number) =>
    3 * (1 - t) ** 2 * t * p + 3 * (1 - t) * t * t * q + t * t * t;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (cubic(t, x1!, x2!) < f) lo = t;
    else hi = t;
  }
  const y = cubic((lo + hi) / 2, y1!, y2!);
  return curve.outputRange[0]! + y * (curve.outputRange[1]! - curve.outputRange[0]!);
}
export type MaterialInput =
  | { source: 'pointer'; x: number; y: number }
  | { source: 'orientation'; pitchDeg: number; rollDeg: number };
export function mapInputToUniforms(material: Material, input: MaterialInput): Uniforms {
  const out = { ...material.uniforms };
  const values: Record<string, number> =
    input.source === 'pointer'
      ? { 'pointer.x': input.x, 'pointer.y': input.y }
      : { 'orientation.pitchDeg': input.pitchDeg, 'orientation.rollDeg': input.rollDeg };
  for (const r of material.responseCurves)
    if (r.source in values) out[r.target] = evaluateCurve(r.curve, values[r.source]!);
  out.tiltX = clamp(out.tiltX, -1, 1);
  out.tiltY = clamp(out.tiltY, -1, 1);
  for (const k of ['strength', 'dispersion', 'noiseStrength', 'roughness', 'ambient'] as const)
    out[k] = clamp(out[k], 0, 1);
  out.anisotropy = clamp(out.anisotropy, -1, 1);
  out.specularSharpness = Math.max(0.01, out.specularSharpness);
  out.normalScale = Math.max(0, out.normalScale);
  return out;
}
export class FpsMonitor {
  private start: number | undefined;
  private windowStart: number | undefined;
  private frames = 0;
  private low = 0;
  constructor(private policy: Effect['fallbackPolicy']['lowFps']) {}
  frame(now: number, hidden: boolean): boolean {
    if (hidden) {
      this.start = undefined;
      this.windowStart = undefined;
      this.frames = 0;
      this.low = 0;
      return false;
    }
    this.start ??= now;
    if (now - this.start < this.policy.warmupMs) return false;
    this.windowStart ??= now;
    this.frames++;
    const span = now - this.windowStart;
    if (span < this.policy.sampleWindowMs) return false;
    const fps = ((this.frames - 1) * 1000) / span;
    this.low = fps < this.policy.threshold ? this.low + 1 : 0;
    this.frames = 0;
    this.windowStart = now;
    return this.low >= this.policy.consecutiveWindows;
  }
}
