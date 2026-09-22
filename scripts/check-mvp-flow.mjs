import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const photo = 'public/assets/mvp/demo-photo.jpg';
const artwork = 'data:image/jpeg;base64,' + readFileSync(photo).toString('base64');
const requests = [];
let configured = false,
  lastJob = null,
  count = 0,
  renderFailures = 0,
  restores = 0;
// Only the browser transport is mocked. Server validation/provider lifecycle are exercised separately by Vitest.
await page.route('**/api/generate', async (route) => {
  const req = route.request();
  if (req.method() === 'GET') return route.fulfill({ json: { configured, model: 'gpt-image-2' } });
  const body = req.postDataBuffer().toString('latin1');
  requests.push(body);
  const requestId = body.match(/name="requestId"\r\n\r\n([^\r]+)/)?.[1];
  lastJob = {
    requestId,
    status: 'ready',
    draw: {
      tier: requests.length === 1 ? 'gold' : 'prism',
      cardId: 'TEST-CARD-' + requests.length,
      configVersion: 'v0.2.0',
      material:requests.length===1?'gold':'prism',
      series:requests.length===1?'aura':'animation',
    },
    poseId: 'test',
    mirror: false,
    attempt: 1,
    remaining: 3 - count,
    successfulCount: count,
    elapsedMs: 2000,
  };
  await route.fulfill({ json: { artwork, job: lastJob } });
});
await page.route('**/api/preview', async (route) => {
  const body = route.request().postDataJSON();
  if (body.action === 'render-failed') {
    renderFailures++;
    lastJob = { ...lastJob, status: 'failed', error: 'RENDER_FAILED' };
    return route.abort('failed');
  }
  if (body.action === 'poll' && lastJob) {
    return route.fulfill({ json: lastJob });
  }
  if (body.action === 'restore') {
    restores++;
    lastJob = { ...lastJob, status: 'ready' };
    return route.fulfill({ json: lastJob });
  }
  if (body.action !== 'complete') return route.continue();
  count++;
  await route.fulfill({
    json: { ...lastJob, status: 'complete', remaining: 3 - count, successfulCount: count },
  });
});
mkdirSync('../output/cards/mvp-integration', { recursive: true });
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '做我的篮球卡' }).click();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await page
    .getByLabel('我同意在本机识别人物，并将所选照片及卡片信息发送至 OpenAI 生成卡面。')
    .check();
  await page.locator('.face-options button').first().waitFor({ timeout: 60000 });
  await page.locator('.face-options button').first().click();
  await page.getByLabel('02 / 卡面昵称').fill('球员姓名');
  await page.getByLabel('03 / 球衣号码').fill('9');
  await page.getByRole('button', { name: 'SG 得分后卫' }).click();
  await page.getByRole('button', { name: '右手', exact: true }).click();
  await page.getByLabel('我确认全部照片中的主体为本人，且有权使用。').check();
  await page.getByLabel('我已年满 18 岁，参与本次内部预览。').check();
  await page.getByRole('button', { name: '制作我的篮球卡' }).click();
  await page.getByRole('alert').filter({ hasText: '图像服务尚未配置' }).waitFor();
  if (requests.length) throw Error('Unconfigured provider was called');
  configured = true;
  await page.getByRole('button', { name: '关闭提示' }).click();
  await page.locator('input[type=file]').nth(1).setInputFiles([photo, photo]);
  await page.getByRole('button', { name: '移除参考 2' }).waitFor();

  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toDataURL;
    let once = true;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      if (once && this.width === 1000 && this.height === 1400) {
        once = false;
        throw Error('测试：卡面导出暂时失败');
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: '制作我的篮球卡' }).click();
  await page.locator('.recovery').waitFor();
  if (renderFailures !== 1 || count !== 0)
    throw Error('Render failure did not release reservation before complete');
  await page.getByRole('button', { name: '查询本次结果' }).click();
  await page.getByRole('button', { name: '保存我的篮球卡' }).waitFor({ timeout: 30000 });
  if (restores !== 1 || requests.length !== 1)
    throw Error('Render retry did not restore cached artwork');
  if ((requests[0].match(/name="photos"/g) || []).length !== 3)
    throw Error('Not all 3 photos uploaded');
  if (!requests[0].includes('\r\n\r\nclassic\r\n')) throw Error('Client should not choose a special series');
  const initial = await page.locator('.result-card img').first().getAttribute('src');
  await page.screenshot({
    path: '../output/cards/mvp-integration/aura-result.png',
    fullPage: true,
  });
  const foil = page.locator('.result-card .bp-full-foil');
  const before = await foil.getAttribute('style');
  await foil.hover({ position: { x: 50, y: 90 }, force: true });
  await page.waitForTimeout(450);
  const after = await foil.getAttribute('style');
  if (before === after) throw Error('Material does not react to pointer');
  await page.getByRole('button', { name: '保存我的篮球卡' }).click();
  await page.locator('.export-image').waitFor();
  const dims = await page
    .locator('.export-image')
    .evaluate((i) => ({ width: i.naturalWidth, height: i.naturalHeight }));
  if (dims.width !== 1000 || dims.height !== 1400)
    throw Error('Wrong export dimensions ' + JSON.stringify(dims));
  await page.locator('.export-image').screenshot({path:'docs/screenshots/new-material-export.png'});
  await page.getByRole('button', { name: '关闭导出' }).click();
  await page.getByRole('button', { name: '再做一张' }).click();
  await page.getByLabel('02 / 卡面昵称').fill('小林');
  await page.getByLabel('03 / 球衣号码').fill('23');

  await page.getByRole('button', { name: '制作我的篮球卡' }).click();
  await page.getByRole('button', { name: '保存我的篮球卡' }).waitFor({ timeout: 30000 });
  const second = await page.locator('.result-card img').first().getAttribute('src');
  if (initial === second || requests.length !== 2)
    throw Error('Second input did not create distinct template output/request');
  await page.screenshot({
    path: '../output/cards/mvp-integration/animation-result.png',
    fullPage: true,
  });
  if (errors.length) throw Error(errors.join('\n'));
  console.log(
    JSON.stringify({
      renderFailureReleased: renderFailures === 1,
      cachedRenderRestored: restores === 1,
      missingKeyBlocked: true,
      threePhotos: true,
      personDetection: true,
      series: ['aura', 'animation'],
      distinctInputs: true,
      dynamicFoil: true,
      export: dims,
      requests: requests.length,
      pageErrors: errors,
      provider: 'mocked transport; no paid API call',
    }),
  );
} catch (e) {
  console.error((await page.locator('body').innerText()).slice(-2500));
  throw e;
} finally {
  await browser.close();
}
