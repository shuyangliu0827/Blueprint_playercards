import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.TEST_URL??'http://localhost:3000');
await page.waitForTimeout(2500);
fs.mkdirSync('docs/screenshots', { recursive: true });
await page.screenshot({ path: 'docs/screenshots/home-desktop.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: 'docs/screenshots/home-mobile.png', fullPage: true });
console.log({
  errors,
  overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
});
await browser.close();
