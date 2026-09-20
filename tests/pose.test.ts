import { describe, expect, test } from 'vitest';
import poseConfigJson from '../config/pose_rules.json';
import { routePose, validatePoseConfig } from '../src/core/pose.js';

const config = validatePoseConfig(poseConfigJson);

describe('pose routing', () => {
  test.each([
    ['PG', 'F', 'RIGHT', 'G-F', false], ['PG', 'L', 'RIGHT', 'G-L', false], ['SG', 'R', 'RIGHT', 'G-R', false],
    ['SF', 'F', 'RIGHT', 'F-F', false], ['PF', 'L', 'RIGHT', 'F-L', false], ['PF', 'R', 'RIGHT', 'F-R', false],
    ['C', 'F', 'RIGHT', 'C-F', false], ['C', 'L', 'RIGHT', 'C-L', false], ['C', 'R', 'RIGHT', 'C-R', false],
  ] as const)('routes %s/%s to %s', (position, angle, handedness, poseId, mirror) => {
    expect(routePose({ position, angle, handedness }, config)).toEqual({ poseId, mirror });
  });

  test('maps uncertain angle to front and keeps handedness as an independent mirror flag', () => {
    expect(routePose({ position: 'SG', angle: 'UNCERTAIN', handedness: 'LEFT' }, config)).toEqual({ poseId: 'G-F', mirror: true });
    expect(routePose({ position: 'SG', angle: 'F', handedness: 'RIGHT' }, config)).toEqual({ poseId: 'G-F', mirror: false });
  });

  test.each([
    [{ position: 'CENTER', angle: 'F', handedness: 'RIGHT' }],
    [{ position: 'PG', angle: 'SIDE', handedness: 'RIGHT' }],
    [{ position: 'PG', angle: 'F', handedness: 'BOTH' }],
  ])('rejects invalid runtime route input %j rather than falling through to a default', (input) => {
    expect(() => routePose(input as never, config)).toThrow();
  });
});

describe('pose configuration validation', () => {
  test.each([
    null,
    {},
    { ...poseConfigJson, canonicalArtHandedness: 'LEFT' },
    { ...poseConfigJson, routes: poseConfigJson.routes.slice(0, 8) },
    { ...poseConfigJson, uncertainAngleFallback: 'L' },
  ])('rejects malformed or altered pose config', (candidate) => {
    expect(() => validatePoseConfig(candidate)).toThrow();
  });
});
