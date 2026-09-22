import {MATERIAL_IDS,SERIES_IDS,type CollectiblePool} from '../core/collectibles';
import { VERSION_PATTERN } from '../core/version';
export { VERSION_PATTERN } from '../core/version';
export const TIER_IDS = ['base', 'silver', 'prism', 'gold', 'obsidian'] as const;
export type Tier = typeof TIER_IDS[number];
export interface RarityConfig {
  readonly collectibles?: CollectiblePool;
  readonly schemaVersion: '1.0.0';
  readonly configVersion: string;
  readonly mode: 'internal-preview';
  readonly tiers: ReadonlyArray<{ readonly id: Tier; readonly label: string; readonly weight: number }>;
  readonly firstDraw: {
    readonly policy: 'first-successful-issuance';
    readonly exclude: readonly ['base'];
    readonly normalization: 'relative-weight';
  };
}

const confirmed: Record<Tier, readonly [string, number]> = {
  base: ['基础', 40], silver: ['银折', 26], prism: ['棱镜', 18], gold: ['金箔', 11], obsidian: ['黑曜', 5]
};

function exactObject(value: unknown, keys: string[], name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name}: expected object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) {
    throw new Error(`${name}: missing or unexpected fields`);
  }
  return record;
}

/** Pure structural + business validation. Does not read files or mutate input. */
export function validateRarityConfig(value: unknown): RarityConfig {
  const extended=Boolean(value && typeof value==='object' && Object.hasOwn(value,'collectibles'));
  const c = exactObject(value, ['schemaVersion', 'configVersion', 'mode', 'tiers', 'firstDraw',...(extended?['collectibles']:[])], 'rarity');
  if(extended){
   if(c.configVersion!=='v0.2.0')throw Error('rarity: unsupported collectible version');
   const pool=exactObject(c.collectibles,['materials','series'],'collectibles');
   for(const [key,ids,weights] of [['materials',MATERIAL_IDS,MATERIAL_IDS.map(()=>1)],['series',SERIES_IDS,[98,1,1]]] as const){
    const entries=pool[key];if(!Array.isArray(entries)||entries.length!==ids.length)throw Error('rarity: incomplete collectible pool');
    const seen=new Set();for(const entry of entries){const row=exactObject(entry,['id','weight'],'collectible');const index=(ids as readonly unknown[]).indexOf(row.id);if(index<0||seen.has(row.id)||row.weight!==weights[index])throw Error('rarity: invalid collectible probability');seen.add(row.id);}
   }
  }else if(c.configVersion==='v0.2.0')throw Error('rarity: collectible pool missing');
  if (c.schemaVersion !== '1.0.0' || c.mode !== 'internal-preview') throw new Error('rarity: unsupported schema or mode');
  if (typeof c.configVersion !== 'string' || !VERSION_PATTERN.test(c.configVersion)) throw new Error('rarity: invalid configVersion');
  if (!Array.isArray(c.tiers) || c.tiers.length !== 5) throw new Error('rarity: exactly five tiers required');
  const seen = new Set<string>();
  let total = 0;
  for (const item of c.tiers) {
    const tier = exactObject(item, ['id', 'label', 'weight'], 'tier');
    if (typeof tier.id !== 'string' || !TIER_IDS.includes(tier.id as Tier) || seen.has(tier.id)) {
      throw new Error('rarity: unknown or duplicate tier');
    }
    if (typeof tier.weight !== 'number' || !Number.isSafeInteger(tier.weight) || tier.weight <= 0) throw new Error('rarity: invalid weight');
    total += tier.weight;
    seen.add(tier.id);
  }
  if (total !== 100) throw new Error('rarity: probability total must equal 100');
  for (const item of c.tiers) {
    const tier = item as { id: Tier; label: string; weight: number };
    const [label, weight] = confirmed[tier.id];
    if (tier.label !== label || tier.weight !== weight) throw new Error('rarity: confirmed v0 parameters cannot change');
  }
  const first = exactObject(c.firstDraw, ['policy', 'exclude', 'normalization'], 'firstDraw');
  if (first.policy !== 'first-successful-issuance' || first.normalization !== 'relative-weight' ||
    !Array.isArray(first.exclude) || first.exclude.length !== 1 || first.exclude[0] !== 'base') {
    throw new Error('rarity: invalid first-draw rule');
  }
  return value as RarityConfig;
}
