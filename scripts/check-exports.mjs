import fs from 'node:fs';
import sharp from 'sharp';
import jsQR from 'jsqr';
const { data, info } = await sharp('docs/screenshots/export-poster.png')
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height);
if (!qr) throw Error('QR failed to decode');
const url = new URL(qr.data);
if (!url.searchParams.get('ref')) throw Error('QR missing ref');
const sizes = {
  card: [1500, 2100],
  poster: [1080, 1440],
  thumbnail: [1000, 800],
  comparison: [2400, 1600],
};
for (const [name, dims] of Object.entries(sizes)) {
  const file = `docs/screenshots/export-${name}.png`,
    meta = await sharp(file).metadata();
  if (meta.width !== dims[0] || meta.height !== dims[1]) throw Error('Wrong export size ' + name);
  const bytes = fs.readFileSync(file);
  if (
    !bytes.includes(Buffer.from('BlueprintProvenance')) ||
    !bytes.includes(Buffer.from('MockGenerator'))
  )
    throw Error('Missing AI provenance ' + name);
  if (meta.density !== 300) throw Error('DPI metadata missing ' + name);
}
console.log(
  'Four export dimensions, PNG synthetic provenance, 300 DPI, and poster QR decode PASS; QR origin',
  url.origin,
);
