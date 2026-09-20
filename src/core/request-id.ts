import { VERSION_PATTERN } from './version';

export interface RequestEnvelope { uuid: string; isFirstDraw: boolean; configVersion: string }

/** Parse only; do not normalize, derive current status or choose a newer config. */
export function parseRequestId(requestId: string): RequestEnvelope {
  if (typeof requestId !== 'string') throw new Error('requestId: expected string');
  const parts = requestId.split(':');
  const [uuid, first, configVersion] = parts;
  if (parts.length !== 3 || !uuid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid) ||
    (first !== '0' && first !== '1') || !configVersion || !VERSION_PATTERN.test(configVersion)) {
    throw new Error('requestId: expected UUID:0|1:configVersion');
  }
  return { uuid, isFirstDraw: first === '1', configVersion };
}
