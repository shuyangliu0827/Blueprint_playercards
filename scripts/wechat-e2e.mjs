import { chromium, expect } from '@playwright/test';
const base = process.env.TEST_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0',
  });
  const p = await context.newPage();
  await p.goto(base);
  await p.getByRole('button', { name: '做我的篮球卡' }).click();
  await p.locator('input[type=file]').setInputFiles('public/assets/examples/art-2.jpg');
  for (const label of [
    '我确认照片为本人，且有权使用。',
    '我已年满 18 岁，参与本次内部预览。',
    '我单独同意在本机检测、裁剪我的人脸，用于这张篮球卡。',
  ])
    await p.getByLabel(label).check();
  await expect(p.getByText(/识别到 1/)).toBeVisible({ timeout: 60000 });
  await p.getByLabel('02 / 卡面昵称').fill('ChristopherLee');
  await p.getByLabel('03 / 球衣号码').fill('00');
  await p.getByRole('button', { name: 'C 中锋', exact: true }).click();
  await p.getByRole('button', { name: '右手', exact: true }).click();
  await p.getByText('内部评审设置').click();
  await p.getByLabel('生成速度').selectOption('fast');
  await p.getByLabel('生成结果').selectOption('success');
  await p.getByRole('button', { name: '制作我的篮球卡' }).click();
  await expect(p.getByRole('button', { name: '保存我的篮球卡' })).toBeVisible({ timeout: 30000 });
  await p.getByRole('button', { name: '链接缩略图' }).click();
  await expect(p.getByText('长按下方图片，选择「保存图片」。')).toBeVisible();
  await expect(p.getByRole('button', { name: '下载图片' })).toHaveCount(0);
  await p.locator('.export-image').evaluate((i) => i.decode());
  await p.screenshot({ path: 'docs/screenshots/wechat-longpress.png', fullPage: true });
  await p.waitForTimeout(500);
  const d = await p.evaluate(() =>
    fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'metrics' }),
    }).then((r) => r.json()),
  );
  expect(d.events.filter((e) => e.name === 'share_longpress_hint_shown')).toHaveLength(1);
  expect(d.events.filter((e) => e.name === 'share_asset_generated')).toHaveLength(1);
  expect(d.events.filter((e) => e.name === 'share_asset_download_triggered')).toHaveLength(0);
  console.log(
    'WeChat user-agent branch PASS, 14-char nickname/00 accepted, no download-success claim. This is Chrome simulation, not WeChat device certification.',
  );
} finally {
  await browser.close();
}
