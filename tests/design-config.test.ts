import { it, expect } from 'vitest';
import layout from '../config/layout.json';
import effect from '../config/effect.json';
import { validateDesign } from '../src/server/design-config';
it('validates design and all five materials', () =>
  expect(validateDesign(layout, effect).effect.materials).toHaveLength(5));
it('rejects duplicate layers and truncated identifiers', () => {
  const l = structuredClone(layout);
  l.front.elements[1]!.zIndex = l.front.elements[0]!.zIndex;
  expect(() => validateDesign(l, effect)).toThrow('Duplicate');
  const b = structuredClone(layout);
  b.front.elements.find((e) => e.id === 'id')!.text!.overflow.onExhausted = 'ellipsis';
  expect(() => validateDesign(b, effect)).toThrow('Required text');
});
it('rejects invalid curve domain and wrong material count', () => {
  const e = structuredClone(effect);
  e.materials[0]!.responseCurves[0]!.curve.points[1]![0] = -1;
  expect(() => validateDesign(layout, e)).toThrow('increase');
  expect(() =>
    validateDesign(layout, { ...effect, materials: effect.materials.slice(1) }),
  ).toThrow();
});
