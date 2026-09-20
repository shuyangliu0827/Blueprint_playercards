/** PNG chunks, including 300 DPI and non-sensitive synthetic provenance. No photo/person fields. */
function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length),
    v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
export function addPngMetadata(bytes: Uint8Array, dpi: number, templateVersion: string) {
  if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[12] !== 73)
    throw new Error('Expected PNG');
  const phys = new Uint8Array(9),
    dv = new DataView(phys.buffer);
  dv.setUint32(0, Math.round(dpi / 0.0254));
  dv.setUint32(4, Math.round(dpi / 0.0254));
  phys[8] = 1;
  const meta = {
    label: 'AI-assisted synthetic preview',
    generator: 'MockGenerator',
    templateVersion,
    notice: 'Internal development preview; not real image generation or certification',
  };
  const itxt = new TextEncoder().encode('BlueprintProvenance\0\0\0\0\0' + JSON.stringify(meta));
  const extra = [chunk('pHYs', phys), chunk('iTXt', itxt)];
  const out = new Uint8Array(bytes.length + extra.reduce((n, b) => n + b.length, 0));
  out.set(bytes.subarray(0, 33));
  let offset = 33;
  for (const b of extra) {
    out.set(b, offset);
    offset += b.length;
  }
  out.set(bytes.subarray(33), offset);
  return out;
}
export async function canvasPng(canvas: HTMLCanvasElement, dpi: number, templateVersion: string) {
  const original = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片导出失败'))), 'image/png'),
  );
  return new Blob(
    [addPngMetadata(new Uint8Array(await original.arrayBuffer()), dpi, templateVersion)],
    { type: 'image/png' },
  );
}
