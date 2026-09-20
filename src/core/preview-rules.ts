export interface PreviewRules {
  readonly version: 'v0';
  readonly freeSuccessfulCards: 3;
  readonly anonymousIdentity: { readonly issuer: 'server'; readonly copies: readonly ['cookie', 'localStorage']; readonly resetByClearingAccepted: true };
  readonly ipPollution: {
    readonly rollingWindowMs: 3600000; readonly distinctAnonIdsThreshold: 5;
    readonly afterExhaustionWindowMs: 600000; readonly action: 'record-only';
    readonly affectsMetricCohorts: false; readonly ipStorage: 'salted-hash-aggregation-only';
  };
}

function record(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('preview rules: expected object');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('preview rules: missing or unexpected fields');
  return value;
}

/** Policy configuration only. Counting and salted-IP aggregation adapters are batch three. */
export function validatePreviewRules(input: unknown): PreviewRules {
  const value = record(input, ['version', 'freeSuccessfulCards', 'anonymousIdentity', 'ipPollution']);
  const identity = record(value.anonymousIdentity, ['issuer', 'copies', 'resetByClearingAccepted']);
  const ip = record(value.ipPollution, ['rollingWindowMs', 'distinctAnonIdsThreshold', 'afterExhaustionWindowMs', 'action', 'affectsMetricCohorts', 'ipStorage']);
  if (value.version !== 'v0' || value.freeSuccessfulCards !== 3 || identity.issuer !== 'server' || identity.resetByClearingAccepted !== true ||
    !Array.isArray(identity.copies) || identity.copies.length !== 2 || identity.copies[0] !== 'cookie' || identity.copies[1] !== 'localStorage' ||
    ip.rollingWindowMs !== 3600000 || ip.distinctAnonIdsThreshold !== 5 || ip.afterExhaustionWindowMs !== 600000 ||
    ip.action !== 'record-only' || ip.affectsMetricCohorts !== false || ip.ipStorage !== 'salted-hash-aggregation-only') {
    throw new Error('preview rules: confirmed policy cannot change');
  }
  return input as PreviewRules;
}
