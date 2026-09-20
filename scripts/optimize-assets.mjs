import fs from 'node:fs';
import sharp from 'sharp';
for (const dir of ['public/assets/examples', 'public/assets/materials'])
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.png')) continue;
    const file = `${dir}/${name}`;
    let pipeline = sharp(file);
    if (name.includes('-static')) pipeline = pipeline.resize(702, 1002);
    if (name.startsWith('card-')) pipeline = pipeline.resize(900, 1260);
    const bytes = await pipeline
      .png({ palette: true, quality: 85, colours: 256, dither: 0.35, effort: 7 })
      .toBuffer();
    fs.writeFileSync(file, bytes);
  }
console.log('Optimized sample and static overlay assets');
