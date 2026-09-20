import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { draw } from '../src/core/draw';
import { parseRequestId } from '../src/core/request-id';
import { validateRarityConfig } from '../src/config/validate';
import { drawForRequest, seedForRequest } from '../src/server/draw-service';
import { rarityFixture as config } from './rarity-fixture';

const secret = 'test-only-stable-secret-at-least-32-bytes';
const uuid = '12345678-1234-4123-8123-123456789abc';
const zero = '0'.repeat(64);
const max = 'f'.repeat(64);
const scale = 1n << 256n;
const atPercent = (n: number) => ((scale * BigInt(n) + 99n) / 100n).toString(16).padStart(64, '0');

describe('rarity config refuses invalid startup data', () => {
  it('accepts the confirmed five mutually exclusive tiers', () => expect(() => validateRarityConfig(config)).not.toThrow());
  it.each([
    ['wrong count', (c: any) => c.tiers.pop()],
    ['wrong total', (c: any) => c.tiers[0].weight = 39],
    ['duplicate tier', (c: any) => c.tiers[1].id = 'base'],
    ['unknown tier', (c: any) => c.tiers[1].id = 'ssp'],
    ['negative', (c: any) => c.tiers[0].weight = -1],
    ['NaN', (c: any) => c.tiers[0].weight = NaN],
    ['string weight', (c: any) => c.tiers[0].weight = '40'],
    ['changed confirmed ratio', (c: any) => { c.tiers[0].weight = 41; c.tiers[1].weight = 25; }],
    ['empty version', (c: any) => c.configVersion = ''],
    ['request delimiter in version', (c: any) => c.configVersion = 'v0:2'],
    ['first draw wrong exclusion', (c: any) => c.firstDraw.exclude = ['silver']],
    ['unsupported rule', (c: any) => c.firstDraw.policy = 'first-attempt'],
    ['missing field', (c: any) => delete c.firstDraw],
    ['unexpected key', (c: any) => c.secret = 'not allowed'],
    ['wrong label', (c: any) => c.tiers[0].label = 'SSP']
  ])('%s is rejected', (_name, mutate) => {
    const bad = structuredClone(config); mutate(bad);
    expect(() => validateRarityConfig(bad)).toThrow();
  });
  it.each([null, [], {}, undefined, 4])('malformed root %s is rejected', c => expect(() => validateRarityConfig(c)).toThrow());
});

describe('portable deterministic draw', () => {
  it.each([[zero, 'base'], [atPercent(40), 'silver'], [atPercent(66), 'prism'], [atPercent(84), 'gold'], [atPercent(95), 'obsidian'], [max, 'obsidian']])('normal boundary %s -> %s', (seed, tier) => {
    expect(draw(config, seed, false).tier).toBe(tier);
  });
  it('selects the preceding tier immediately before every normal boundary', () => {
    for (const [percent, tier] of [[40, 'base'], [66, 'silver'], [84, 'prism'], [95, 'gold']] as const) {
      const seed = (BigInt(`0x${atPercent(percent)}`) - 1n).toString(16).padStart(64, '0');
      expect(draw(config, seed, false).tier).toBe(tier);
    }
  });
  it('first draw uses exact 26:18:11:5 relative weights, not rounded percentages', () => {
    expect(draw(config, zero, true).tier).toBe('silver');
    expect(draw(config, max, true).tier).toBe('obsidian');
    const boundary = ((scale * 26n + 59n) / 60n).toString(16).padStart(64, '0');
    expect(draw(config, boundary, true).tier).toBe('prism');
    expect(draw(config, (BigInt(`0x${boundary}`) - 1n).toString(16).padStart(64, '0'), true).tier).toBe('silver');
  });
  it('does not mutate config and returns only the public result', () => {
    const before = structuredClone(config);
    const result = draw(config, zero, false);
    expect(config).toEqual(before);
    expect(result).toEqual({ tier: 'base', cardId: `card_${zero}`, configVersion: 'v0.1.0' });
    expect(draw(config, max, false).cardId).not.toBe(result.cardId);
  });
  it('array reordering does not change the deterministic result', () => {
    const reordered = { ...config, tiers: [...config.tiers].reverse() };
    expect(draw(reordered, atPercent(66), false)).toEqual(draw(config, atPercent(66), false));
  });
  it.each(['', 'x'.repeat(64), '0'.repeat(63), '0'.repeat(65), '0x' + zero])('rejects malformed seed', seed => expect(() => draw(config, seed, false)).toThrow());
  it('rejects nonboolean first draw flags', () => expect(() => draw(config, zero, 1 as any)).toThrow());
});

describe('request envelope and server HMAC', () => {
  it('reads version and first flag from the full request ID', () => {
    expect(parseRequestId(`${uuid}:1:v0.1.0`)).toEqual({ uuid, isFirstDraw: true, configVersion: 'v0.1.0' });
    expect(parseRequestId(`${uuid}:0:v0.1.0`).isFirstDraw).toBe(false);
  });
  it.each([`${uuid}:true:v0.1.0`, `${uuid}:2:v0.1.0`, `${uuid}:1:`, `${uuid}:1:v0:1`, `no-uuid:1:v0.1.0`, `${uuid}:1:../secret`, ` ${uuid}:1:v0.1.0`])('rejects malformed request %s', id => expect(() => parseRequestId(id)).toThrow());
  it('HMAC uses the full original request ID and returns SHA-256 hex', () => {
    const id = `${uuid}:1:v0.1.0`;
    // Independent OpenSSL HMAC-SHA256 fixture, not derived by code under test.
    expect(seedForRequest(secret, id)).toBe('ea455145ea220d56e655f95245c12c92155a3f956c8bf378efc111b4a1b07328');
    expect(seedForRequest(secret, id)).toBe(createHmac('sha256', secret).update(id, 'utf8').digest('hex'));
    expect(seedForRequest(secret, `${uuid}:0:v0.1.0`)).not.toBe(seedForRequest(secret, id));
    expect(seedForRequest(secret, `${uuid}:1:v0.2.0`)).not.toBe(seedForRequest(secret, id));
  });
  it('fails closed for a missing or weak secret', () => {
    for (const key of ['', 'short']) expect(() => seedForRequest(key, `${uuid}:1:v0.1.0`)).toThrow();
  });
  it('retains the exact card on replay after another version becomes available', () => {
    const id = `${uuid}:1:v0.1.0`;
    const old = new Map([['v0.1.0', config]]);
    const result = drawForRequest(id, secret, old);
    const upgraded = new Map([['v0.2.0', { ...config, configVersion: 'v0.2.0' }], ...old]);
    expect(drawForRequest(id, secret, upgraded)).toEqual(result);
    expect(drawForRequest(id, secret, upgraded)).toEqual(result);
  });
  it('unknown version must never fall back to the latest version', () => {
    expect(() => drawForRequest(`${uuid}:1:v9`, secret, new Map([['v0.1.0', config]]))).toThrow();
  });
  it('rejects registry entries that lie about their version', () => {
    expect(() => drawForRequest(`${uuid}:1:v9`, secret, new Map([['v9', config]]))).toThrow();
  });
});

describe('100,000 sample distribution for each pool', () => {
  it.each([false, true])('100k draws, first=%s', first => {
    const counts: Record<string, number> = { base: 0, silver: 0, prism: 0, gold: 0, obsidian: 0 };
    const cards = new Set<string>();
    for (let i = 0; i < 100000; i++) {
      const seed = createHmac('sha256', secret).update(`distribution-case-${i}`).digest('hex');
      const result = draw(config, seed, first);
      counts[result.tier]!++;
      cards.add(result.cardId);
    }
    const probabilities = first ? [0, 26 / 60, 18 / 60, 11 / 60, 5 / 60] : [.40, .26, .18, .11, .05];
    let chiSquare = 0;
    Object.keys(counts).forEach((tier, i) => {
      const p = probabilities[i]!;
      if (!p) expect(counts[tier]).toBe(0);
      else {
        const expected = 100000 * p;
        expect(Math.abs(counts[tier]! - expected)).toBeLessThan(6 * Math.sqrt(100000 * p * (1 - p)));
        chiSquare += (counts[tier]! - expected) ** 2 / expected;
      }
    });
    expect(chiSquare).toBeLessThan(25);
    expect(cards.size).toBe(100000);
    console.info(JSON.stringify({ pool: first ? 'first' : 'regular', count: 100000, counts, chiSquare }));
  });
});
