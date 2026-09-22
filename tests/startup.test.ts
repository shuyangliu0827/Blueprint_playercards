import { describe, expect, it } from 'vitest';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadRarityRegistry } from '../src/server/config-loader';

const configDir = fileURLToPath(new URL('../config/', import.meta.url));
function fixture(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'basketball-v3-config-'));
  try { cpSync(configDir, dir, { recursive: true }); run(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
function changeRegistry(dir: string, mutate: (r: any) => void) {
  const path = join(dir, 'rarity_registry.json');
  const data = JSON.parse(readFileSync(path, 'utf8')); mutate(data);
  writeFileSync(path, JSON.stringify(data));
}

describe('server refuses invalid or changed configuration before drawing', () => {
  it('loads the active config and freezes its nested contents', () => {
    const result = loadRarityRegistry(configDir);
    expect(result.activeVersion).toBe('v0.2.0');
    const config = result.registry.get(result.activeVersion) as any;
    expect(config.tiers).toHaveLength(5);
    expect(() => config.tiers[0].weight = 99).toThrow();
  });
  it('detects edits of an issued config using the version fingerprint', () => fixture(dir => {
    writeFileSync(join(dir, 'rarity_v0.json'), readFileSync(join(dir, 'rarity_v0.json'), 'utf8') + '\n');
    expect(() => loadRarityRegistry(dir)).toThrow(/fingerprint/);
  }));
  it('validates business rules even if a bad config fingerprint was registered', () => fixture(dir => {
    const path = join(dir, 'rarity_v0.json');
    const data = JSON.parse(readFileSync(path, 'utf8')); data.tiers.pop();
    const raw = JSON.stringify(data); writeFileSync(path, raw);
    changeRegistry(dir, r => r.versions[0].sha256 = createHash('sha256').update(raw).digest('hex'));
    expect(() => loadRarityRegistry(dir)).toThrow(/five tiers/);
  }));
  it.each([
    ['duplicate versions', (r: any) => r.versions.push(r.versions[0])],
    ['missing active version', (r: any) => r.activeVersion = 'v9'],
    ['path traversal', (r: any) => r.versions[0].file = '../.env.local'],
    ['absolute path', (r: any) => r.versions[0].file = '/tmp/rarity_v0.json'],
    ['mismatched version', (r: any) => { r.versions[0].configVersion = 'v9'; r.activeVersion = 'v9'; }],
    ['invalid fingerprint', (r: any) => r.versions[0].sha256 = 'not-a-hash'],
    ['unknown field', (r: any) => r.ignoreValidation = true]
  ])('rejects %s', (_label, mutate) => fixture(dir => {
    changeRegistry(dir, mutate); expect(() => loadRarityRegistry(dir)).toThrow();
  }));
  it('missing files fail closed', () => fixture(dir => {
    rmSync(join(dir, 'rarity_v0.json')); expect(() => loadRarityRegistry(dir)).toThrow();
  }));
  it('invalid JSON fails closed', () => fixture(dir => {
    writeFileSync(join(dir, 'rarity_registry.json'), '{'); expect(() => loadRarityRegistry(dir)).toThrow();
  }));
});
