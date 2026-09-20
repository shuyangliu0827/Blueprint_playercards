import { expect, it } from 'vitest';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createDrawService, loadConfiguration } from '../src/server/bootstrap';

const configDir = fileURLToPath(new URL('../config/', import.meta.url));
const script = fileURLToPath(new URL('../scripts/check-config.ts', import.meta.url));
const secret = 'integration-test-only-stable-32-byte-secret';
function fixture(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'basketball-v3-startup-'));
  try { cpSync(configDir, dir, { recursive: true }); run(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
function check(directory: string) {
  return spawnSync(process.execPath, ['--conditions=react-server', '--import', 'tsx', script, '--config-dir', directory], { encoding: 'utf8' });
}

it('configuration check succeeds without reading environment secret files', () => {
  expect(() => loadConfiguration(configDir)).not.toThrow();
  const result = check(configDir);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('Configuration valid');
});
it('service creation requires secret from explicit environment input', () => {
  expect(() => createDrawService(configDir, {})).toThrow(/DRAW_HMAC_SECRET/);
  expect(() => createDrawService(configDir, { DRAW_HMAC_SECRET: 'weak' })).toThrow(/DRAW_HMAC_SECRET/);
});
it('service returns only public version and stable draw result', () => {
  const service = createDrawService(configDir, { DRAW_HMAC_SECRET: secret });
  expect(service.publicConfig).toEqual({ configVersion: 'v0.1.0' });
  const request = '12345678-1234-4123-8123-123456789abc:1:v0.1.0';
  const result = service.draw(request);
  expect(result).toMatchObject({ configVersion: 'v0.1.0' });
  expect(Object.keys(result as object).sort()).toEqual(['cardId', 'configVersion', 'tier']);
  expect(service.draw(request)).toEqual(result);
  expect(JSON.stringify(service)).not.toContain(secret);
  expect(Object.keys(service)).toEqual(['publicConfig', 'draw']);
});
it.each(['input_schema.json', 'pose_rules.json', 'story_templates.json', 'player_names.json', 'metrics_v0.json', 'preview_rules.json'])('malformed %s prevents starting', file => fixture(dir => {
  writeFileSync(join(dir, file), '{}');
  expect(() => createDrawService(dir, { DRAW_HMAC_SECRET: secret })).toThrow();
  const result = check(dir);
  expect(result.status).toBe(1);
  expect(result.stdout).not.toContain('Configuration valid');
}));
it('missing dictionary rows prevent starting', () => fixture(dir => {
  const file = join(dir, 'events_dictionary.csv');
  const rows = readFileSync(file, 'utf8').trim().split('\n'); rows.splice(2, 1);
  writeFileSync(file, rows.join('\n'));
  expect(check(dir).status).toBe(1);
}));
it('malformed tier configuration terminates the real startup command', () => fixture(dir => {
  const file = join(dir, 'rarity_v0.json');
  const config = JSON.parse(readFileSync(file, 'utf8')); config.tiers.pop();
  writeFileSync(file, JSON.stringify(config));
  const result = check(dir);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Configuration invalid');
}));
