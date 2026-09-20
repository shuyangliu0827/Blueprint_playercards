import { expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { rarityFixture } from './rarity-fixture';

it('draw bundles for browser and runs without Node, browser or framework APIs', () => {
  const output = buildSync({
    entryPoints: [fileURLToPath(new URL('../src/core/draw.ts', import.meta.url))],
    bundle: true, platform: 'browser', format: 'iife', globalName: 'Core', target: 'es2020', write: false
  }).outputFiles![0]!.text;
  const result = runInNewContext(`${output}; Core.draw(config, '0'.repeat(64), true)`, { config: rarityFixture });
  expect(JSON.parse(JSON.stringify(result))).toEqual({ tier: 'silver', cardId: `card_${'0'.repeat(64)}`, configVersion: 'v0.1.0' });
});

it('server adapter cannot be bundled into a browser build', () => {
  expect(() => buildSync({
    entryPoints: [fileURLToPath(new URL('../src/server/draw-service.ts', import.meta.url))],
    bundle: true, platform: 'browser', write: false, logLevel: 'silent'
  })).toThrow();
});

it('server-only guard rejects imports outside the server condition', () => {
  const path = fileURLToPath(new URL('../src/server/draw-service.ts', import.meta.url));
  const result = spawnSync(process.execPath, ['--import', 'tsx', path], { encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('cannot be imported from a Client Component');
});
