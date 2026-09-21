import { describe, expect, test } from 'vitest';
import inputConfigJson from '../config/input_schema.json';
import playerNamesJson from '../config/player_names.json';
import {
  normalizePlayerAlias,
  validateCardInput,
  validateInputConfig,
  validatePlayerNamesConfig,
  type CardInput,
} from '../src/core/input.js';

const inputConfig = validateInputConfig(inputConfigJson);
const playerNames = validatePlayerNamesConfig(playerNamesJson);

function validInput(overrides: Partial<CardInput> = {}): CardInput {
  return {
    photo: {
      mimeType: 'image/jpeg',
      byteSize: 9_999_999,
      width: 1024,
      height: 1400,
    },
    nickname: '阿杰',
    jerseyNumber: '00',
    position: 'PG',
    handedness: 'LEFT',
    faceDetection: { faceCount: 1, angle: 'UNCERTAIN' },
    faceProcessingConsent: true,
    photoRightsConfirmed: true,
    adultSelfDeclaration: true,
    ...overrides,
  };
}

describe('card input validation', () => {
  test('accepts a selected back-facing person with zero visible faces and retains the subject result', () => {
    const candidate = {
      ...validInput({ faceDetection: { faceCount: 0, angle: 'UNCERTAIN' } }),
      subjectDetection: { personCount: 3, selectedPersonIndex: 1 },
    };
    const result = validateCardInput(candidate, inputConfig, playerNames);
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({ subjectDetection: candidate.subjectDetection });
  });

  test('requires a subject choice when several bodies are detected even if a face is visible', () => {
    const result = validateCardInput({ ...validInput(), subjectDetection: { personCount: 3 } }, inputConfig, playerNames);
    expect(result.errors.map((error) => error.code)).toContain('SUBJECT_SELECTION_REQUIRED');
  });

  test.each([0, -1, 1.5])('rejects invalid person count %s instead of falling back to spectators faces', (personCount) => {
    expect(validateCardInput({ ...validInput(), subjectDetection: { personCount } }, inputConfig, playerNames).ok).toBe(false);
  });

  test('rejects an out-of-range person selection', () => {
    const result = validateCardInput({ ...validInput(), subjectDetection: { personCount: 2, selectedPersonIndex: 2 } }, inputConfig, playerNames);
    expect(result.errors.map((error) => error.code)).toContain('SUBJECT_SELECTION_INVALID');
  });
  test.each(['photo', 'nickname', 'jerseyNumber', 'position', 'handedness'] as const)(
    'rejects a missing required %s field',
    (field) => {
      const candidate = { ...validInput() } as Record<string, unknown>;
      delete candidate[field];
      expect(validateCardInput(candidate, inputConfig, playerNames).ok).toBe(false);
    },
  );

  test('accepts exactly 10,000,000 bytes and rejects one byte more', () => {
    expect(validateCardInput(validInput({ photo: { mimeType: 'image/png', byteSize: 10_000_000, width: 1200, height: 1024 } }), inputConfig, playerNames).ok).toBe(true);
    const result = validateCardInput(validInput({ photo: { mimeType: 'image/png', byteSize: 10_000_001, width: 1200, height: 1024 } }), inputConfig, playerNames);
    expect(result.errors.map((error) => error.code)).toContain('PHOTO_TOO_LARGE');
  });

  test.each(['image/jpeg', 'image/png', 'image/heic'])(
    'accepts supported photo type %s',
    (mimeType) => {
      expect(validateCardInput(validInput({ photo: { mimeType, byteSize: 100, width: 1024, height: 1024 } }), inputConfig, playerNames).ok).toBe(true);
    },
  );

  test('rejects an unsupported photo type and a photo without a detected face', () => {
    const badType = validateCardInput(validInput({ photo: { mimeType: 'image/webp', byteSize: 100, width: 1024, height: 1024 } }), inputConfig, playerNames);
    expect(badType.errors.map((error) => error.code)).toContain('PHOTO_TYPE_UNSUPPORTED');
    const noFace = validateCardInput(validInput({ faceDetection: { faceCount: 0, angle: 'F' } }), inputConfig, playerNames);
    expect(noFace.errors.map((error) => error.code)).toContain('FACE_NOT_DETECTED');
  });

  test('warns but does not reject when the short edge is below 1024', () => {
    const result = validateCardInput(validInput({ photo: { mimeType: 'image/heic', byteSize: 100, width: 1023, height: 2000 } }), inputConfig, playerNames);
    expect(result.ok).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['PHOTO_SHORT_EDGE_LOW']);
  });

  test('requires a selected subject for multiple faces and accepts an in-range selection', () => {
    const missing = validateCardInput(validInput({ faceDetection: { faceCount: 2, angle: 'L' } }), inputConfig, playerNames);
    expect(missing.errors.map((error) => error.code)).toContain('SUBJECT_SELECTION_REQUIRED');
    const selected = validateCardInput(validInput({ faceDetection: { faceCount: 2, selectedFaceIndex: 1, angle: 'L' } }), inputConfig, playerNames);
    expect(selected.ok).toBe(true);
    const outOfRange = validateCardInput(validInput({ faceDetection: { faceCount: 2, selectedFaceIndex: 2, angle: 'L' } }), inputConfig, playerNames);
    expect(outOfRange.errors.map((error) => error.code)).toContain('SUBJECT_SELECTION_INVALID');
  });

  test('rejects a non-string face angle instead of coercing it to a valid enum', () => {
    const result = validateCardInput(
      validInput({ faceDetection: { faceCount: 1, angle: ['F'] as unknown as 'F' } }),
      inputConfig,
      playerNames,
    );
    expect(result.errors.map((error) => error.code)).toContain('FACE_RESULT_REQUIRED');
  });

  test('rejects a supplied subject selection outside the face range even for one face', () => {
    const result = validateCardInput(
      validInput({ faceDetection: { faceCount: 1, selectedFaceIndex: 9, angle: 'F' } }),
      inputConfig,
      playerNames,
    );
    expect(result.errors.map((error) => error.code)).toContain('SUBJECT_SELECTION_INVALID');
  });

  test.each([
    ['中文六字限额', true],
    ['中文七字超限啦', false],
    ['ABCDEFGHIJKLMN', true],
    ['ABCDEFGHIJKLMNO', false],
    ['  Marcus  ', true],
    ['中A', false],
    ['', false],
  ])('validates nickname %j', (nickname, accepted) => {
    expect(validateCardInput(validInput({ nickname }), inputConfig, playerNames).ok).toBe(accepted);
  });

  test.each([
    ['0', true], ['00', true], ['07', true], ['99', true],
    ['100', false], ['-1', false], ['7.0', false], ['', false],
  ])('validates jersey number %j while preserving its string form', (jerseyNumber, accepted) => {
    const result = validateCardInput(validInput({ jerseyNumber }), inputConfig, playerNames);
    expect(result.ok).toBe(accepted);
    if (accepted) expect(result.value?.jerseyNumber).toBe(jerseyNumber);
  });

  test('does not supply a default handedness', () => {
    const candidate = validInput() as unknown as Record<string, unknown>;
    delete candidate.handedness;
    const result = validateCardInput(candidate, inputConfig, playerNames);
    expect(result.errors.map((error) => error.code)).toContain('HANDEDNESS_REQUIRED');
  });

  test.each(['faceProcessingConsent', 'photoRightsConfirmed', 'adultSelfDeclaration'] as const)(
    'requires explicit %s',
    (field) => {
      const result = validateCardInput(validInput({ [field]: false }), inputConfig, playerNames);
      expect(result.ok).toBe(false);
    },
  );

  test('normalizes player aliases but uses exact comparison rather than substring matching', () => {
    expect(normalizePlayerAlias('  LeBron_James  ')).toBe('lebron james');
    expect(validateCardInput(validInput({ nickname: 'LEBRON-JAMES' }), inputConfig, playerNames).errors.map((error) => error.code)).toContain('NICKNAME_PLAYER_NAME');
    expect(validateCardInput(validInput({ nickname: 'Jameson' }), inputConfig, playerNames).ok).toBe(true);
  });

  test.each(['Harden', '大胡子', 'Kyrie Irving', '詹皇', '库昊', '杜少', '麦迪', '奥拉朱旺'])(
    'rejects newly maintained common player alias %j',
    (nickname) => {
      expect(validateCardInput(validInput({ nickname }), inputConfig, playerNames).errors.map((error) => error.code)).toContain('NICKNAME_PLAYER_NAME');
    },
  );
});

describe('input configuration validation', () => {
  test.each([
    null,
    {},
    { ...inputConfigJson, maxPhotoBytes: 10_000_001 },
    { ...inputConfigJson, positions: ['PG', 'SG', 'SF', 'PF'] },
    { ...inputConfigJson, allowedPhotoMimeTypes: ['image/jpeg'] },
  ])('rejects malformed or altered input config', (candidate) => {
    expect(() => validateInputConfig(candidate)).toThrow();
  });

  test.each([
    null,
    {},
    { version: 'v0', entries: [] },
    { version: 'v0', entries: [{ canonicalName: '', aliases: ['James'] }] },
    { version: 'v0', entries: [{ canonicalName: 'LeBron James', aliases: [''] }] },
  ])('rejects malformed player-name config', (candidate) => {
    expect(() => validatePlayerNamesConfig(candidate)).toThrow();
  });

  test('requires every canonical player name to appear among its aliases', () => {
    expect(() => validatePlayerNamesConfig({
      version: 'v0',
      scope: 'maintained deny list',
      entries: [{ canonicalName: 'LeBron James', aliases: ['King James'] }],
    })).toThrow();
  });
});
