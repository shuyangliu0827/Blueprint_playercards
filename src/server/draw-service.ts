import 'server-only';
import { createHmac } from 'node:crypto';
import { draw, type DrawResult } from '../core/draw';
import { parseRequestId } from '../core/request-id';
import { validateRarityConfig } from '../config/validate';

export function assertSecret(secret: unknown): asserts secret is string {
  if (typeof secret !== 'string' || !secret.trim() || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('DRAW_HMAC_SECRET must contain at least 32 UTF-8 bytes');
  }
}

export function seedForRequest(secret: string, requestId: string): string {
  assertSecret(secret);
  parseRequestId(requestId);
  return createHmac('sha256', secret).update(requestId, 'utf8').digest('hex');
}

export function drawForRequest(requestId: string, secret: string, registry: ReadonlyMap<string, unknown>): DrawResult {
  const envelope = parseRequestId(requestId);
  // v0 让步。生产环境必须改为服务端权威判定首抽状态 + 持久化 requestId 去重。
  // isFirstDraw/configVersion come ONLY from the immutable request envelope.
  const config = registry.get(envelope.configVersion);
  if (!config) throw new Error('draw: unknown configVersion; refusing fallback');
  const validated = validateRarityConfig(config);
  if (validated.configVersion !== envelope.configVersion) throw new Error('draw: registry version mismatch');
  return draw(validated, seedForRequest(secret, requestId), envelope.isFirstDraw);
}
