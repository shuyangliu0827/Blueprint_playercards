import { describe, expect, it } from 'vitest';
import { foilVariables, materialForCard } from '../src/render/cards-css';
describe('cards-css adapter', () => {
  it('clamps pointer values and resets the original background range', () => {
    const a=foilVariables(100,-100);
    expect(a['--pointer-x']).toBe('100%');
    expect(a['--pointer-y']).toBe('0%');
    expect(Number(a['--pointer-from-center'])).toBeLessThanOrEqual(1);
    const rest=foilVariables(0,0);
    expect(rest['--background-x']).toBe('50%');
    expect(rest['--background-y']).toBe('50%');
    expect(Object.values(foilVariables(NaN,Infinity)).join('')).not.toMatch(/NaN|Infinity/);
  });
  it('keeps the base unfoiled and gold identity across series', () => {
    expect(materialForCard('base','aura')).toBe('none');
    expect(materialForCard('gold','aura')).toBe('gold');
    expect(materialForCard('silver','aura')).toBe('cosmos');
  });
});

import { HOLO_EFFECTS } from '@kongyo2/cards-css';
import { CARD_MATERIALS, strongFoilVisual } from '../src/render/cards-css';
it('exposes every material in the exact screenshot demo engine',()=>{
  expect(Object.keys(CARD_MATERIALS)).toEqual([...HOLO_EFFECTS]);
  expect(Object.keys(CARD_MATERIALS)).toHaveLength(15);
});
it('uses a stronger saturated foil without washing the photograph out with white glare',()=>{
 const visual=strongFoilVisual(1.6);
 expect(visual.brightness).toBeLessThanOrEqual(1);
 expect(visual.saturate).toBeGreaterThan(1);
 expect(visual.glareOpacity).toBeLessThanOrEqual(.15);
 expect(strongFoilVisual(2.5).shineOpacity).toBeLessThan(1);
});
