import { it, expect } from 'vitest';
import { addPngMetadata } from '../src/render/png-metadata';
it('writes pixel density and synthetic provenance without personal data', () => {
  const input = new Uint8Array(45);
  input[0] = 137;
  input[1] = 80;
  input[12] = 73;
  const out = addPngMetadata(input, 300, 'v1');
  const s = new TextDecoder().decode(out);
  expect(s).toContain('iTXt');
  expect(s).toContain('BlueprintCardRenderer');
  expect(s).toContain('pHYs');
  expect(new DataView(out.buffer).getUint32(41)).toBe(11811);
  expect(out.slice(-12)).toEqual(input.slice(-12));
});
it('rejects non PNG', () => expect(() => addPngMetadata(new Uint8Array(10), 300, 'x')).toThrow());
