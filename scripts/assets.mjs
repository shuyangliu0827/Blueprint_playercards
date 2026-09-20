import fs from 'node:fs';
import sharp from 'sharp';
const source = process.env.SOURCE_ART_DIR;
if (!source) throw new Error('Set SOURCE_ART_DIR to the authorized prepared-art directory');
for (const [i, name] of ['sea-lions-shooter', 'swifts-handler', 'mustangs-finisher'].entries())
  await sharp(`${source}/${name}.png`)
    .resize(1100, 1500, { fit: 'cover' })
    .jpeg({ quality: 88 })
    .toFile(`public/assets/examples/art-${i + 1}.jpg`);
const n = 256;
let seed = 481516;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (const kind of ['normal', 'noise', 'coverage', 'protect']) {
  const data = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      let r = 0,
        g = 0,
        b = 0;
      const u = x / n,
        v = y / n;
      if (kind === 'normal') {
        const fac = Math.sin((Math.floor(u * 9) + Math.floor(v * 13)) * 2.7);
        r = 128 + fac * 60;
        g = 128 + Math.sin((u - v) * 60) * 32;
        b = 240;
      }
      if (kind === 'noise') r = g = b = Math.round(random() * 255);
      if (kind === 'coverage') r = g = b = v > 0.76 || v < 0.085 ? 0 : 255;
      if (kind === 'protect') {
        const d = ((u - 0.5) / 0.22) ** 2 + ((v - 0.3) / 0.23) ** 2;
        r = g = b = Math.round(Math.max(0, 1 - d) * 255);
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  await sharp(data, { raw: { width: n, height: n, channels: 4 } })
    .png()
    .toFile(`public/assets/materials/${kind}.png`);
}
fs.cpSync('node_modules/@mediapipe/tasks-vision/wasm', 'public/wasm', { recursive: true });
