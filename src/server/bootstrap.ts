import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateInputConfig, validatePlayerNamesConfig } from '../core/input';
import { validatePoseConfig } from '../core/pose';
import { validateStoryConfig } from '../core/story';
import { validatePreviewRules } from '../core/preview-rules';
import { validateEventDictionary, validateMetricsConfig } from '../core/events';
import { deepFreeze, loadRarityRegistry } from './config-loader';
import { assertSecret, drawForRequest } from './draw-service';

function unwrap<T>(name: string, result: { ok: true; value: T } | { ok: false; errors: string[] }): T {
  if (!result.ok) throw new Error(`${name}: ${result.errors.join('; ')}`);
  return result.value;
}

/** All nonvisual configurations must pass before a service is constructed. */
export function loadConfiguration(directory: string) {
  const json = (file: string): unknown => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const rarity = loadRarityRegistry(directory);
  return {
    ...rarity,
    input: deepFreeze(validateInputConfig(json('input_schema.json'))),
    playerNames: validatePlayerNamesConfig(json('player_names.json')),
    poses: deepFreeze(validatePoseConfig(json('pose_rules.json'))),
    stories: deepFreeze(validateStoryConfig(json('story_templates.json'))),
    previewRules: deepFreeze(validatePreviewRules(json('preview_rules.json'))),
    metrics: deepFreeze(unwrap('metrics_v0', validateMetricsConfig(json('metrics_v0.json')))),
    events: deepFreeze(unwrap('events_dictionary', validateEventDictionary(readFileSync(join(directory, 'events_dictionary.csv'), 'utf8'))))
  };
}

/** H5/API adapter factory: the probability registry and secret stay in this closure. */
export function createDrawService(directory: string, environment: Readonly<Record<string, string | undefined>>) {
  const secret = environment.DRAW_HMAC_SECRET;
  assertSecret(secret);
  const config = loadConfiguration(directory);
  return Object.freeze({
    publicConfig: Object.freeze({ configVersion: config.activeVersion }),
    draw: (requestId: string) => drawForRequest(requestId, secret, config.registry)
  });
}
