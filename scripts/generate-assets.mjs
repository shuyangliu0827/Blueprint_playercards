import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import fs from 'node:fs';
await build({
  entryPoints: ['scripts/build-preview-assets.ts'],
  outfile: 'public/build-assets.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
});
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.addScriptTag({ url: '/build-assets.js' });
  const outputs = await page.evaluate(() => window.buildPreviewAssets());
  for (const [path, data] of Object.entries(outputs)) {
    fs.writeFileSync(`public/assets/${path}`, Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log('Generated static material captures and three example cards', Object.keys(outputs));
} finally {
  await browser.close();
  fs.unlinkSync('public/build-assets.js');
}
