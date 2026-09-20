import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateRarityConfig, VERSION_PATTERN, type RarityConfig } from '../config/validate';

function objectWithKeys(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('registry: invalid object');
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== keys.length || keys.some(k => !Object.hasOwn(obj, k))) throw new Error('registry: invalid fields');
  return obj;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Read-only file adapter. Archived versions are never silently replaced by activeVersion. */
export function loadRarityRegistry(directory: string): { activeVersion: string; registry: ReadonlyMap<string, RarityConfig> } {
  const manifest = objectWithKeys(JSON.parse(readFileSync(join(directory, 'rarity_registry.json'), 'utf8')), ['schemaVersion', 'activeVersion', 'versions']);
  if (manifest.schemaVersion !== '1.0.0' || typeof manifest.activeVersion !== 'string' || !VERSION_PATTERN.test(manifest.activeVersion) ||
    !Array.isArray(manifest.versions) || !manifest.versions.length) throw new Error('registry: invalid version metadata');
  const registry = new Map<string, RarityConfig>();
  for (const raw of manifest.versions) {
    const entry = objectWithKeys(raw, ['configVersion', 'file', 'sha256']);
    if (typeof entry.configVersion !== 'string' || !VERSION_PATTERN.test(entry.configVersion) || registry.has(entry.configVersion) ||
      typeof entry.file !== 'string' || !/^rarity_[A-Za-z0-9_-][A-Za-z0-9._-]*\.json$/.test(entry.file) ||
      typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error('registry: invalid or duplicate entry');
    const contents = readFileSync(join(directory, entry.file));
    if (createHash('sha256').update(contents).digest('hex') !== entry.sha256) throw new Error('registry: config fingerprint mismatch');
    const config = validateRarityConfig(JSON.parse(contents.toString('utf8')));
    if (config.configVersion !== entry.configVersion) throw new Error('registry: configVersion mismatch');
    registry.set(config.configVersion, deepFreeze(config));
  }
  if (!registry.has(manifest.activeVersion)) throw new Error('registry: active version missing');
  return { activeVersion: manifest.activeVersion, registry };
}
