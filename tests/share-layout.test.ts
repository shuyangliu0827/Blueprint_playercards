import { it, expect } from 'vitest';
import { POSTER_CARD_RECT as r } from '../src/render/sharing';
it('keeps the entire 5:7 card centered and above the QR footer with at least 60% poster coverage', () => {
  expect((r.w * r.h) / (1080 * 1440)).toBeGreaterThanOrEqual(0.6);
  expect(r.w / r.h).toBeCloseTo(5 / 7, 10);
  expect(r.x + r.w / 2).toBe(1080 / 2);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.y + r.h).toBeLessThanOrEqual(1190);
});
