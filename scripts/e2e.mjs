import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
const base = process.env.TEST_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [],
  posts = [],
  external = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.method() === 'POST') posts.push({ url: r.url(), data: r.postData() });
  if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:'))
    external.push(r.url());
});
try {
  await page.goto(base);
  await page.getByRole('button', { name: '做我的篮球卡' }).click();
  await page.locator('input[type=file]').setInputFiles('public/assets/examples/art-2.jpg');
  await page.getByLabel('我确认照片为本人，且有权使用。').check();
  await page.getByLabel('我已年满 18 岁，参与本次内部预览。').check();
  await page.getByLabel('我单独同意在本机检测、裁剪我的人脸，用于这张篮球卡。').check();
  await expect(page.getByText(/识别到 [1-9]/)).toBeVisible({ timeout: 60000 });
  console.log('Local detector:', await page.getByText(/识别到 [1-9]/).textContent());
  if (await page.locator('.face-options button').count())
    await page.locator('.face-options button').first().click();
  await page.getByLabel('02 / 卡面昵称').fill('小满');
  await page.getByLabel('03 / 球衣号码').fill('07');
  await page.getByRole('button', { name: 'PG 控球后卫' }).click();
  await page.getByRole('button', { name: '左手', exact: true }).click();
  await page.getByText('内部评审设置').click();
  await page.getByLabel('生成速度').selectOption('fast');
  await page.getByLabel('生成结果').selectOption('retry');
  await page.screenshot({ path: 'docs/screenshots/input-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '制作我的篮球卡' }).click();
  await expect(page.getByRole('button', { name: '保存我的篮球卡' })).toBeVisible({
    timeout: 45000,
  });
  await page.screenshot({ path: 'docs/screenshots/result-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '翻到卡背' }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'docs/screenshots/back-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '查看正面' }).click();
  for (const [button, type] of [
    ['保存我的篮球卡', 'card'],
    ['制作分享海报', 'poster'],
    ['原图 + 成品对比', 'comparison'],
    ['链接缩略图', 'thumbnail'],
  ]) {
    await page.getByRole('button', { name: button }).click();
    await expect(page.locator('.export-image')).toBeVisible();
    await page.locator('.export-image').evaluate((img) => img.decode());
    const dims = await page
      .locator('.export-image')
      .evaluate((img) => [img.naturalWidth, img.naturalHeight]);
    console.log(type, dims);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载图片' }).click();
    await (await downloadPromise).saveAs(`docs/screenshots/export-${type}.png`);
    await page.getByRole('button', { name: '关闭导出' }).click();
  }
  let data = await page.evaluate(async () =>
    fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'metrics' }),
    }).then((r) => r.json()),
  );
  console.log(
    'EVENTS',
    data.events.map((e) => e.name),
  );
  expect(data.events.filter((e) => e.name === 'generation_retry')).toHaveLength(1);
  expect(data.events.filter((e) => e.name === 'card_generated')).toHaveLength(1);
  expect(data.events.filter((e) => e.name === 'share_asset_generated')).toHaveLength(4);
  expect(data.events.filter((e) => e.name === 'comparison_requested')).toHaveLength(1);
  expect(data.events.filter((e) => e.name === 'share_asset_download_triggered')).toHaveLength(4);
  await page.getByRole('button', { name: /再做一张/ }).click();
  await page.getByText('内部评审设置').click();
  await page.getByLabel('生成结果').selectOption('fail');
  await page.getByRole('button', { name: '制作我的篮球卡' }).click();
  await expect(page.getByRole('button', { name: '恢复这张卡' })).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: 'docs/screenshots/failure-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '恢复这张卡' }).click();
  await expect(page.getByRole('button', { name: '保存我的篮球卡' })).toBeVisible({
    timeout: 15000,
  });
  const ref = await page.evaluate(async () =>
    fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'session' }),
    })
      .then((r) => r.json())
      .then((s) => s.refToken),
  );
  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(`${base}/?ref=${encodeURIComponent(ref)}`);
  await expect(gp.getByRole('button', { name: '做我的篮球卡' })).toBeVisible();
  await gp.waitForTimeout(1500);
  await gp.reload();
  await gp.waitForTimeout(1000);
  await guest.close();
  data = await page.evaluate(async () =>
    fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'metrics' }),
    }).then((r) => r.json()),
  );
  expect(data.events.filter((e) => e.name === 'shared_link_opened')).toHaveLength(1);
  expect(data.events.filter((e) => e.name === 'generation_refunded')).toHaveLength(1);
  expect(data.events.filter((e) => e.name === 'generation_restored')).toHaveLength(1);
  expect(posts.every((p) => !p.data?.includes('base64') && !p.data?.includes('data:image'))).toBe(
    true,
  );
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  fs.writeFileSync(
    'docs/e2e-results.json',
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        base,
        passed: true,
        networkRequests: posts.length,
        external,
        errors,
        metrics: data.metrics,
        events: data.events.map((e) => e.name),
      },
      null,
      2,
    ),
  );
  console.log('E2E PASS', data.metrics);
} catch (e) {
  await page.screenshot({ path: 'docs/screenshots/e2e-failure.png', fullPage: true });
  console.log({ errors, external });
  throw e;
} finally {
  await browser.close();
}
