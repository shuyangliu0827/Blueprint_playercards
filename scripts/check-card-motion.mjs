import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const pixels = () =>
  page.locator('.specials canvas').evaluateAll((nodes) => nodes.map((c) => c.toDataURL()));
mkdirSync('../output/cards/motion-check', { recursive: true });
try {
  await page.goto('http://127.0.0.1:4179/', { waitUntil: 'networkidle' });
  await page.locator('.specials canvas').nth(1).waitFor();
  const first = await pixels();
  await page.waitForTimeout(800);
  const second = await pixels();
  if (first.some((v, i) => v === second[i])) throw Error('A special card does not animate');
  await page.screenshot({ path: '../output/cards/motion-check/playing.png', fullPage: true });
  await page.getByRole('button', { name: 'Ⅱ 暂停动画', exact: true }).click();
  const paused = await pixels();
  await page.waitForTimeout(600);
  if (JSON.stringify(paused) !== JSON.stringify(await pixels()))
    throw Error('Paused cards still change');
  await page.getByRole('button', { name: '↻ 从头播放', exact: true }).click();
  const resumed = await pixels();
  await page.waitForTimeout(600);
  if (JSON.stringify(resumed) === JSON.stringify(await pixels()))
    throw Error('Replay did not start');
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.locator('.note').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const hidden = await pixels();
  await page.waitForTimeout(600);
  if (JSON.stringify(hidden) !== JSON.stringify(await pixels()))
    throw Error('Offscreen special cards still change');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(100);
  const still = await pixels();
  await page.waitForTimeout(600);
  if (JSON.stringify(still) !== JSON.stringify(await pixels()))
    throw Error('Reduced motion ignored');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '../output/cards/motion-check/mobile.png', fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error('Mobile horizontal overflow');
  if (errors.length) throw Error(errors.join('\n'));
  console.log(
    JSON.stringify({
      auraAnimated: true,
      animationAnimated: true,
      pause: true,
      replay: true,
      offscreenSuspended: true,
      reducedMotion: true,
      mobile: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
