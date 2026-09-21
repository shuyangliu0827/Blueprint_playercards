import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const photo = process.argv[2];
if (!photo) throw new Error('Pass a local back-facing basketball photo path.');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
mkdirSync('../output/cards', { recursive: true });
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '做我的篮球卡' }).click();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await page
    .getByLabel('我同意在本机识别人物，并将所选照片及卡片信息发送至 OpenAI 生成卡面。')
    .check();
  await page.locator('.face-options button').first().waitFor({ timeout: 60000 });
  const people = await page.locator('.face-options button').count();
  await page.screenshot({ path: '../output/cards/person-detection-check.png', fullPage: true });
  await page.locator('.face-options button').first().click();
  if (errors.length) throw new Error(errors.join('\n'));

  // Hold real image decoding so revocation happens while chooseFile is awaiting it.
  const revoked = await browser.newPage();
  await revoked.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...descriptor,
      set(value) {
        if (window.holdPhoto && value.startsWith('blob:')) {
          window.releasePhotoDecode = () => descriptor.set.call(this, value);
        } else descriptor.set.call(this, value);
      },
    });
  });
  await revoked.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await revoked.getByRole('button', { name: '做我的篮球卡' }).click();
  const consent = revoked.getByLabel(
    '我同意在本机识别人物，并将所选照片及卡片信息发送至 OpenAI 生成卡面。',
  );
  await consent.check();
  await revoked.evaluate(() => {
    window.holdPhoto = true;
  });
  await revoked.locator('input[type=file]').first().setInputFiles(photo);
  await revoked.waitForFunction(() => typeof window.releasePhotoDecode === 'function');
  await consent.uncheck();
  await revoked.evaluate(() => window.releasePhotoDecode());
  await revoked.waitForFunction(() => {
    const upload = document.querySelector('.upload-box.has-photo');
    return upload && !upload.disabled;
  });
  if (await revoked.locator('.face-options button').count())
    throw new Error('Detection ran after consent was revoked during decoding.');
  await revoked.close();
  console.log(
    JSON.stringify({
      people,
      personDetection: true,
      revokedDuringDecode: 'passed',
      pageErrors: errors,
    }),
  );
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(-2500));
  throw error;
} finally {
  await browser.close();
}
