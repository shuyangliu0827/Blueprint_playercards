import type { FaceAngle, Handedness, Position } from './input.js';

export type PositionGroup = 'G' | 'F' | 'C';
export type RoutedFaceAngle = 'F' | 'L' | 'R';
export type PoseId = `${PositionGroup}-${RoutedFaceAngle}`;

export interface PoseRoute { readonly positionGroup: PositionGroup; readonly angle: RoutedFaceAngle; readonly poseId: PoseId }
export interface PoseConfig {
  readonly version: 'v0';
  readonly canonicalArtHandedness: 'RIGHT';
  readonly uncertainAngleFallback: 'F';
  readonly routes: readonly PoseRoute[];
}

const expectedPoseIds = ['G-F', 'G-L', 'G-R', 'F-F', 'F-L', 'F-R', 'C-F', 'C-L', 'C-R'] as const;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export function validatePoseConfig(value: unknown): PoseConfig {
  if (!isRecord(value) || Object.keys(value).sort().join('|') !== ['version', 'canonicalArtHandedness', 'uncertainAngleFallback', 'routes'].sort().join('|')) throw new Error('pose config is malformed');
  if (value.version !== 'v0' || value.canonicalArtHandedness !== 'RIGHT' || value.uncertainAngleFallback !== 'F' || !Array.isArray(value.routes) || value.routes.length !== 9) throw new Error('pose config does not match confirmed v0 values');
  const routes = value.routes.map((route, index) => {
    const expectedPoseId = expectedPoseIds[index];
    if (expectedPoseId === undefined || !isRecord(route) || Object.keys(route).sort().join('|') !== 'angle|poseId|positionGroup' || route.poseId !== expectedPoseId) throw new Error(`pose route ${index} is invalid`);
    const [group, angle] = expectedPoseId.split('-') as [PositionGroup, RoutedFaceAngle];
    if (route.positionGroup !== group || route.angle !== angle) throw new Error(`pose route ${index} is inconsistent`);
    return { positionGroup: group, angle, poseId: expectedPoseId };
  });
  return { version: 'v0', canonicalArtHandedness: 'RIGHT', uncertainAngleFallback: 'F', routes };
}

export function routePose(input: { readonly position: Position; readonly angle: FaceAngle; readonly handedness: Handedness }, config: PoseConfig): { poseId: PoseId; mirror: boolean } {
  if (!isRecord(input) || typeof input.position !== 'string' || !['PG', 'SG', 'SF', 'PF', 'C'].includes(input.position) || typeof input.angle !== 'string' || !['F', 'L', 'R', 'UNCERTAIN'].includes(input.angle) || typeof input.handedness !== 'string' || !['LEFT', 'RIGHT'].includes(input.handedness)) {
    throw new Error('pose routing input is invalid');
  }
  const position = input.position as Position;
  const faceAngle = input.angle as FaceAngle;
  const handedness = input.handedness as Handedness;
  const group: PositionGroup = position === 'PG' || position === 'SG' ? 'G' : position === 'C' ? 'C' : 'F';
  const angle: RoutedFaceAngle = faceAngle === 'UNCERTAIN' ? config.uncertainAngleFallback : faceAngle;
  const route = config.routes.find((candidate) => candidate.positionGroup === group && candidate.angle === angle);
  if (!route) throw new Error(`no pose route for ${group}-${angle}`);
  return { poseId: route.poseId, mirror: handedness !== config.canonicalArtHandedness };
}
