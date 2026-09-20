import { expect, it } from 'vitest';
import rules from '../config/preview_rules.json';
import { validatePreviewRules } from '../src/core/preview-rules';

it('accepts the record-only three-free preview policy', () => expect(() => validatePreviewRules(rules)).not.toThrow());
it.each([
  ['paid or extra quota', (r: any) => r.freeSuccessfulCards = 4],
  ['rate limiting', (r: any) => r.ipPollution.action = 'block'],
  ['raw IP storage', (r: any) => r.ipPollution.ipStorage = 'raw'],
  ['changed primary window', (r: any) => r.ipPollution.rollingWindowMs = 600000],
  ['changed threshold', (r: any) => r.ipPollution.distinctAnonIdsThreshold = 6],
  ['changed auxiliary window', (r: any) => r.ipPollution.afterExhaustionWindowMs = 3600000],
  ['filter polluted users', (r: any) => r.ipPollution.affectsMetricCohorts = true],
  ['missing field', (r: any) => delete r.ipPollution.action],
  ['extra field', (r: any) => r.silentBan = true],
  ['identity change', (r: any) => r.anonymousIdentity.issuer = 'client'],
  ['missing double write', (r: any) => r.anonymousIdentity.copies = ['cookie']]
])('rejects %s', (_label, mutate) => {
  const invalid = structuredClone(rules); mutate(invalid);
  expect(() => validatePreviewRules(invalid)).toThrow();
});
