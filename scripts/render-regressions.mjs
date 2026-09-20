import { chromium, expect } from '@playwright/test';
const base = process.env.TEST_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const p = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  await p.goto(base + '/debug/thumbnails');
  await expect(p.locator('.debug-item')).toHaveCount(4, { timeout: 30000 });
  await p.getByRole('button', { name: '强制静态降级' }).click();
  await expect(p.locator('.foil-surface img')).toHaveCount(5);
  await p.getByRole('button', { name: '恢复动态 WebGL' }).click();
  await p.waitForTimeout(450);
  expect(
    await p.locator('.foil-surface canvas').evaluateAll((cs) =>
      cs.every((c) => {
        const gl = c.getContext('webgl');
        return gl && !gl.isContextLost();
      }),
    ),
  ).toBe(true);
  await p.screenshot({ path: 'docs/screenshots/debug-desktop.png', fullPage: true });
  const fallback = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'experimental-webgl') return null;
      return original.call(this, type, ...args);
    };
  });
  await fallback.goto(base);
  await expect(fallback.getByText('静态反光模式')).toBeVisible({ timeout: 15000 });
  await fallback.getByRole('button', { name: /金箔/ }).click();
  await expect(fallback.locator('.foil-surface img')).toHaveAttribute(
    'src',
    '/assets/materials/gold-static.png',
  );
  await expect(fallback.getByText('静态反光模式')).toBeVisible();
  await fallback.screenshot({ path: 'docs/screenshots/no-webgl-mobile.png', fullPage: true });
  console.log(
    'Rendering regressions PASS: four centeredcrops, allfivefallback, dynamicrestore, noWebGL materialchange',
  );
} finally {
  await browser.close();
}
