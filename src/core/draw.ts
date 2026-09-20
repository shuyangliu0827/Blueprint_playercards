import { TIER_IDS, validateRarityConfig, type Tier } from '../config/validate';

export interface DrawResult { tier: Tier; cardId: string; configVersion: string }

/**
 * Portable pure function: no framework, clock, random source, storage or platform API.
 * Integer arithmetic maps a 256-bit HMAC seed to a weighted bucket. The finite
 * seed space can differ by at most one seed per bucket; no floating rounding.
 * Tier order is canonical so reordering JSON entries cannot change issued cards.
 */
export function draw(config: unknown, seed: string, isFirstDraw: boolean): DrawResult {
  const c = validateRarityConfig(config);
  if (typeof seed !== 'string' || !/^[0-9a-fA-F]{64}$/.test(seed)) throw new Error('draw: expected 256-bit hexadecimal seed');
  if (typeof isFirstDraw !== 'boolean') throw new Error('draw: isFirstDraw must be boolean');
  const normalizedSeed = seed.toLowerCase();
  const pool = TIER_IDS.filter(id => !(isFirstDraw && c.firstDraw.exclude.includes(id as 'base')))
    .map(id => c.tiers.find(t => t.id === id)!);
  const totalWeight = pool.reduce((sum, t) => sum + t.weight, 0);
  let bucket = Number((BigInt(`0x${normalizedSeed}`) * BigInt(totalWeight)) / (1n << 256n));
  for (const tier of pool) {
    if (bucket < tier.weight) return { tier: tier.id, cardId: `card_${normalizedSeed}`, configVersion: c.configVersion };
    bucket -= tier.weight;
  }
  throw new Error('draw: no result in a validated pool');
}
