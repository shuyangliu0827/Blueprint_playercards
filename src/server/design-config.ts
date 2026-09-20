import 'server-only';
import Ajv2020 from 'ajv/dist/2020.js';
import layoutSchema from '../../config/schemas/layout.schema.json';
import effectSchema from '../../config/schemas/effect.schema.json';
import type { Layout, Effect } from '../render/types';
const ajv = new Ajv2020({ allErrors: true, strict: false });
const checkLayout = ajv.compile(layoutSchema);
const checkEffect = ajv.compile(effectSchema);
export function validateDesign(
  layout: unknown,
  effect: unknown,
): { layout: Layout; effect: Effect } {
  if (!checkLayout(layout)) throw new Error(`layout: ${ajv.errorsText(checkLayout.errors)}`);
  if (!checkEffect(effect)) throw new Error(`effect: ${ajv.errorsText(checkEffect.errors)}`);
  const l = layout as Layout,
    e = effect as Effect;
  if (l.canvas.width / l.canvas.height !== 5 / 7) throw new Error('Card ratio must be 5:7');
  if (l.templateVersion !== e.templateVersion) throw new Error('Template versions mismatch');
  const fonts = new Set(l.fonts.map((f) => f.id));
  if (fonts.size !== l.fonts.length) throw new Error('Duplicate fonts');
  for (const face of [l.front, l.back]) {
    const zs = new Set<number>(),
      ids = new Set<string>();
    for (const el of face.elements) {
      if (zs.has(el.zIndex) || ids.has(el.id)) throw new Error('Duplicate layer zIndex/id');
      zs.add(el.zIndex);
      ids.add(el.id);
      if (el.safeAreaPolicy === 'inside') {
        const r = el.rect,
          s = l.safeArea;
        if (
          r.x < s.left ||
          r.y < s.top ||
          r.x + r.w > l.canvas.width - s.right ||
          r.y + r.h > l.canvas.height - s.bottom
        )
          throw new Error(`Unsafe area: ${el.id}`);
      }
      if (el.text) {
        if (!fonts.has(el.text.fontRef)) throw new Error('Unknown font');
        const t = el.text;
        if (
          ['cardId', 'jerseyNumber', 'aiLabel'].includes(t.content.binding ?? '') &&
          (t.overflow.strategy === 'truncate' || t.overflow.onExhausted === 'ellipsis')
        )
          throw new Error('Required text cannot be truncated');
        if (t.overflow.minFontSize && t.overflow.minFontSize > t.fontSize)
          throw new Error('Invalid min font size');
      }
      if (el.material?.slotId && el.material.slotId !== e.surface.slotId)
        throw new Error('Unknown material slot');
    }
  }
  for (const m of e.materials) {
    if (m.uniforms.lightDirection.every((v) => v === 0)) throw new Error('Zero light vector');
    const targets = new Set<string>();
    for (const r of m.responseCurves) {
      const key = r.source.split('.')[0] + r.target;
      if (targets.has(key)) throw new Error('Duplicate response target');
      targets.add(key);
      if (r.curve.kind === 'piecewise-linear') {
        for (let i = 1; i < r.curve.points.length; i++)
          if (r.curve.points[i]![0]! <= r.curve.points[i - 1]![0]!)
            throw new Error('Curve inputs must increase');
      } else if (r.curve.inputRange[0]! >= r.curve.inputRange[1]!)
        throw new Error('Invalid curve range');
    }
  }
  return { layout: l, effect: e };
}
