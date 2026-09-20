import { describe, expect, it } from 'vitest';
import {
  classifyFaceAngle,
  getPhotoWarnings,
  normalizeDetectionBox,
  type PreparedPhoto,
} from '../src/platform/photo';

const points = (noseX: number, score = 0.9) => [
  { x: 0.4, y: 0.4, score },
  { x: 0.6, y: 0.4, score },
  { x: noseX, y: 0.52, score },
];

describe('classifyFaceAngle', () => {
  it('classifies a centered face as front-facing', () => {
    expect(classifyFaceAngle(points(0.5))).toBe('F');
  });

  it('classifies visible horizontal yaw', () => {
    expect(classifyFaceAngle(points(0.44))).toBe('L');
    expect(classifyFaceAngle(points(0.56))).toBe('R');
  });

  it('returns uncertainty for missing, low-confidence, or extreme geometry', () => {
    expect(classifyFaceAngle([])).toBe('UNCERTAIN');
    expect(classifyFaceAngle(points(0.5, 0.2))).toBe('UNCERTAIN');
    expect(classifyFaceAngle(points(0.7))).toBe('UNCERTAIN');
    expect(classifyFaceAngle(points(Number.NaN))).toBe('UNCERTAIN');
    expect(
      classifyFaceAngle([
        { x: 0.4, y: 0.4 },
        { x: Number.POSITIVE_INFINITY, y: 0.4 },
        { x: 0.5, y: 0.5 },
      ]),
    ).toBe('UNCERTAIN');
  });

  it('accepts labeled MediaPipe keypoints independently of ordering', () => {
    expect(
      classifyFaceAngle([
        { x: 0.55, y: 0.5, label: 'nose tip' },
        { x: 0.6, y: 0.4, label: 'left eye' },
        { x: 0.4, y: 0.4, label: 'right eye' },
      ]),
    ).toBe('R');
  });
});

describe('photo policy helpers', () => {
  const photo = (shortEdge: number): PreparedPhoto => ({
    image: {} as HTMLImageElement,
    objectUrl: 'blob:test',
    metadata: { mimeType: 'image/jpeg', byteSize: 100, width: shortEdge, height: 2000 },
  });

  it('warns at 1023px but not at the configured 1024px boundary', () => {
    expect(getPhotoWarnings(photo(1023))).toHaveLength(1);
    expect(getPhotoWarnings(photo(1024))).toEqual([]);
  });

  it('clamps detection boxes to the image and rejects empty geometry', () => {
    const clamped = normalizeDetectionBox(
      { originX: 80, originY: -10, width: 40, height: 50 },
      100,
      100,
    );
    expect(clamped).toMatchObject({ x: 0.8, y: 0, h: 0.4 });
    expect(clamped?.w).toBeCloseTo(0.2);
    expect(
      normalizeDetectionBox({ originX: 10, originY: 10, width: 0, height: 20 }, 100, 100),
    ).toBeUndefined();
    expect(
      normalizeDetectionBox({ originX: 120, originY: 10, width: 20, height: 20 }, 100, 100),
    ).toBeUndefined();
  });
});
