import { describe, expect, it } from 'vitest';
import { materialCoverage, fitArtwork, foilFacetVertices } from '../src/render/mvp-material';

describe('fixed-template artwork and material safety', () => {
  it('preserves all artwork for portrait and landscape source photographs', () => {
    for (const [w, h] of [
      [1000, 1400],
      [2000, 1000],
      [600, 1800],
    ]) {
      const r = fitArtwork(w!, h!, { x: 30, y: 80, w: 940, h: 1140 });
      expect(r.x).toBeGreaterThanOrEqual(30);
      expect(r.y).toBeGreaterThanOrEqual(80);
      expect(r.x + r.w).toBeLessThanOrEqual(970.000001);
      expect(r.y + r.h).toBeLessThanOrEqual(1220.000001);
      expect(r.w / r.h).toBeCloseTo(w! / h!);
    }
  });
  it('keeps foil off the central athlete, player name, logo and series heading', () => {
    for (const series of ['classic', 'aura', 'animation'] as const) {
      expect(materialCoverage(0.5, 0.48, series)).toBe(0);
      expect(materialCoverage(0.5, 0.925, series)).toBe(0);
      expect(materialCoverage(0.82, 0.075, series)).toBe(0);
      expect(materialCoverage(0.5, 0.09, series)).toBe(0);
      expect(materialCoverage(0.02, 0.45, series)).toBeGreaterThan(0.8);
    }
  });
  it('creates repeatable irregular facets instead of a regular rainbow grid', () => {
    expect(foilFacetVertices(4, 6)).toEqual(foilFacetVertices(4, 6));
    expect(foilFacetVertices(4, 6)).not.toEqual(foilFacetVertices(5, 6));
    const vertices = foilFacetVertices(4, 6);
    expect(vertices).toHaveLength(3);
    expect(vertices.every((p) => p.every(Number.isFinite))).toBe(true);
  });
});
