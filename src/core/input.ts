export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type Handedness = 'LEFT' | 'RIGHT';
export type FaceAngle = 'F' | 'L' | 'R' | 'UNCERTAIN';

export interface PhotoMetadata {
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
}

export interface FaceDetectionResult {
  readonly faceCount: number;
  readonly selectedFaceIndex?: number;
  readonly angle: FaceAngle;
}

export interface CardInput {
  readonly photo: PhotoMetadata;
  readonly nickname: string;
  readonly jerseyNumber: string;
  readonly position: Position;
  readonly handedness: Handedness;
  readonly faceDetection: FaceDetectionResult;
  readonly subjectDetection?: { readonly personCount: number; readonly selectedPersonIndex?: number };
  readonly faceProcessingConsent: boolean;
  readonly photoRightsConfirmed: boolean;
  readonly adultSelfDeclaration: boolean;
}

export interface InputConfig {
  readonly version: 'v0';
  readonly allowedPhotoMimeTypes: readonly ['image/jpeg', 'image/png', 'image/heic'];
  readonly maxPhotoBytes: 10_000_000;
  readonly shortEdgeWarningPixels: 1024;
  readonly nickname: {
    readonly hanMinCharacters: 1;
    readonly hanMaxCharacters: 6;
    readonly latinMinCharacters: 1;
    readonly latinMaxCharacters: 14;
  };
  readonly jerseyNumberPattern: '^[0-9]{1,2}$';
  readonly positions: readonly ['PG', 'SG', 'SF', 'PF', 'C'];
  readonly handedness: readonly ['LEFT', 'RIGHT'];
  readonly requiredDeclarations: readonly ['faceProcessingConsent', 'photoRightsConfirmed', 'adultSelfDeclaration'];
}

export interface PlayerNameEntry {
  readonly canonicalName: string;
  readonly aliases: readonly string[];
}

export interface PlayerNamesConfig {
  readonly version: 'v0';
  readonly scope: string;
  readonly entries: readonly PlayerNameEntry[];
  readonly normalizedAliases: ReadonlySet<string>;
}

export type InputIssueCode =
  | 'PHOTO_REQUIRED' | 'PHOTO_TYPE_UNSUPPORTED' | 'PHOTO_TOO_LARGE' | 'PHOTO_DIMENSIONS_INVALID'
  | 'NICKNAME_REQUIRED' | 'NICKNAME_FORMAT_INVALID' | 'NICKNAME_PLAYER_NAME'
  | 'JERSEY_NUMBER_REQUIRED' | 'JERSEY_NUMBER_INVALID' | 'POSITION_REQUIRED' | 'POSITION_INVALID'
  | 'HANDEDNESS_REQUIRED' | 'HANDEDNESS_INVALID' | 'FACE_RESULT_REQUIRED' | 'FACE_NOT_DETECTED'
  | 'SUBJECT_SELECTION_REQUIRED' | 'SUBJECT_SELECTION_INVALID' | 'FACE_CONSENT_REQUIRED'
  | 'PHOTO_RIGHTS_REQUIRED' | 'ADULT_DECLARATION_REQUIRED' | 'PHOTO_SHORT_EDGE_LOW'
  | 'PERSON_NOT_DETECTED' | 'SUBJECT_RESULT_INVALID';

export interface InputIssue { readonly code: InputIssueCode; readonly field: string }
export interface InputValidationResult {
  readonly ok: boolean;
  readonly errors: readonly InputIssue[];
  readonly warnings: readonly InputIssue[];
  readonly value?: CardInput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function assertExactArray(value: unknown, expected: readonly string[], label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length !== expected.length || value.some((item, index) => item !== expected[index])) {
    throw new Error(`${label} must equal the confirmed values`);
  }
}

export function validateInputConfig(value: unknown): InputConfig {
  if (!isRecord(value)) throw new Error('input config must be an object');
  assertExactKeys(value, ['version', 'allowedPhotoMimeTypes', 'maxPhotoBytes', 'shortEdgeWarningPixels', 'nickname', 'jerseyNumberPattern', 'positions', 'handedness', 'requiredDeclarations'], 'input config');
  if (value.version !== 'v0' || value.maxPhotoBytes !== 10_000_000 || value.shortEdgeWarningPixels !== 1024 || value.jerseyNumberPattern !== '^[0-9]{1,2}$') {
    throw new Error('input config does not match confirmed v0 values');
  }
  assertExactArray(value.allowedPhotoMimeTypes, ['image/jpeg', 'image/png', 'image/heic'], 'allowedPhotoMimeTypes');
  assertExactArray(value.positions, ['PG', 'SG', 'SF', 'PF', 'C'], 'positions');
  assertExactArray(value.handedness, ['LEFT', 'RIGHT'], 'handedness');
  assertExactArray(value.requiredDeclarations, ['faceProcessingConsent', 'photoRightsConfirmed', 'adultSelfDeclaration'], 'requiredDeclarations');
  if (!isRecord(value.nickname)) throw new Error('nickname config must be an object');
  assertExactKeys(value.nickname, ['hanMinCharacters', 'hanMaxCharacters', 'latinMinCharacters', 'latinMaxCharacters'], 'nickname config');
  if (value.nickname.hanMinCharacters !== 1 || value.nickname.hanMaxCharacters !== 6 || value.nickname.latinMinCharacters !== 1 || value.nickname.latinMaxCharacters !== 14) {
    throw new Error('nickname config does not match confirmed v0 values');
  }
  return value as unknown as InputConfig;
}

export function normalizePlayerAlias(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s._'’\-]+/gu, ' ');
}

export function validatePlayerNamesConfig(value: unknown): PlayerNamesConfig {
  if (!isRecord(value)) throw new Error('player names config must be an object');
  assertExactKeys(value, ['version', 'scope', 'entries'], 'player names config');
  if (value.version !== 'v0' || typeof value.scope !== 'string' || value.scope.trim().length === 0 || !Array.isArray(value.entries) || value.entries.length === 0) {
    throw new Error('player names config is malformed');
  }
  const aliases = new Set<string>();
  const entries: PlayerNameEntry[] = value.entries.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`player entry ${index} must be an object`);
    assertExactKeys(entry, ['canonicalName', 'aliases'], `player entry ${index}`);
    if (typeof entry.canonicalName !== 'string' || entry.canonicalName.trim().length === 0 || !Array.isArray(entry.aliases) || entry.aliases.length === 0) {
      throw new Error(`player entry ${index} is malformed`);
    }
    const checkedAliases = entry.aliases.map((alias) => {
      if (typeof alias !== 'string' || normalizePlayerAlias(alias).length === 0) throw new Error(`player entry ${index} has an invalid alias`);
      aliases.add(normalizePlayerAlias(alias));
      return alias;
    });
    if (!checkedAliases.some((alias) => normalizePlayerAlias(alias) === normalizePlayerAlias(entry.canonicalName as string))) {
      throw new Error(`player entry ${index} must include its canonical name among aliases`);
    }
    return { canonicalName: entry.canonicalName, aliases: checkedAliases };
  });
  return { version: 'v0', scope: value.scope, entries, normalizedAliases: aliases };
}

function issue(code: InputIssueCode, field: string): InputIssue { return { code, field }; }

function validNickname(value: string, config: InputConfig): boolean {
  const count = Array.from(value).length;
  if (/^\p{Script=Han}+$/u.test(value)) return count >= config.nickname.hanMinCharacters && count <= config.nickname.hanMaxCharacters;
  if (/^\p{Script=Latin}+(?:[ ._'’\-]\p{Script=Latin}+)*$/u.test(value)) return count >= config.nickname.latinMinCharacters && count <= config.nickname.latinMaxCharacters;
  return false;
}

export function validateCardInput(candidate: unknown, config: InputConfig, playerNames: PlayerNamesConfig): InputValidationResult {
  const errors: InputIssue[] = [];
  const warnings: InputIssue[] = [];
  if (!isRecord(candidate)) return { ok: false, errors: [issue('PHOTO_REQUIRED', 'photo')], warnings };

  const photo = candidate.photo;
  if (!isRecord(photo)) errors.push(issue('PHOTO_REQUIRED', 'photo'));
  else {
    if (typeof photo.mimeType !== 'string' || !config.allowedPhotoMimeTypes.includes(photo.mimeType as never)) errors.push(issue('PHOTO_TYPE_UNSUPPORTED', 'photo.mimeType'));
    if (!Number.isInteger(photo.byteSize) || (photo.byteSize as number) < 1 || (photo.byteSize as number) > config.maxPhotoBytes) errors.push(issue('PHOTO_TOO_LARGE', 'photo.byteSize'));
    if (!Number.isInteger(photo.width) || !Number.isInteger(photo.height) || (photo.width as number) < 1 || (photo.height as number) < 1) errors.push(issue('PHOTO_DIMENSIONS_INVALID', 'photo'));
    else if (Math.min(photo.width as number, photo.height as number) < config.shortEdgeWarningPixels) warnings.push(issue('PHOTO_SHORT_EDGE_LOW', 'photo'));
  }

  const nickname = typeof candidate.nickname === 'string' ? candidate.nickname.trim().normalize('NFKC') : '';
  if (!nickname) errors.push(issue('NICKNAME_REQUIRED', 'nickname'));
  else if (!validNickname(nickname, config)) errors.push(issue('NICKNAME_FORMAT_INVALID', 'nickname'));
  else if (playerNames.normalizedAliases.has(normalizePlayerAlias(nickname))) errors.push(issue('NICKNAME_PLAYER_NAME', 'nickname'));

  const jerseyNumber = candidate.jerseyNumber;
  if (typeof jerseyNumber !== 'string' || jerseyNumber.length === 0) errors.push(issue('JERSEY_NUMBER_REQUIRED', 'jerseyNumber'));
  else if (!new RegExp(config.jerseyNumberPattern).test(jerseyNumber)) errors.push(issue('JERSEY_NUMBER_INVALID', 'jerseyNumber'));

  const position = candidate.position;
  if (typeof position !== 'string' || position.length === 0) errors.push(issue('POSITION_REQUIRED', 'position'));
  else if (!config.positions.includes(position as never)) errors.push(issue('POSITION_INVALID', 'position'));

  const handedness = candidate.handedness;
  if (typeof handedness !== 'string' || handedness.length === 0) errors.push(issue('HANDEDNESS_REQUIRED', 'handedness'));
  else if (!config.handedness.includes(handedness as never)) errors.push(issue('HANDEDNESS_INVALID', 'handedness'));

  const faceDetection = candidate.faceDetection;
  const subjectDetection = candidate.subjectDetection;
  if (subjectDetection !== undefined) {
    if (!isRecord(subjectDetection) || !Number.isInteger(subjectDetection.personCount) || (subjectDetection.personCount as number) < 0) {
      errors.push(issue('SUBJECT_RESULT_INVALID', 'subjectDetection'));
    } else if (subjectDetection.personCount === 0) {
      errors.push(issue('PERSON_NOT_DETECTED', 'subjectDetection.personCount'));
    } else if (subjectDetection.selectedPersonIndex !== undefined && (!Number.isInteger(subjectDetection.selectedPersonIndex) || (subjectDetection.selectedPersonIndex as number) < 0 || (subjectDetection.selectedPersonIndex as number) >= (subjectDetection.personCount as number))) {
      errors.push(issue('SUBJECT_SELECTION_INVALID', 'subjectDetection.selectedPersonIndex'));
    } else if ((subjectDetection.personCount as number) > 1 && subjectDetection.selectedPersonIndex === undefined) {
      errors.push(issue('SUBJECT_SELECTION_REQUIRED', 'subjectDetection.selectedPersonIndex'));
    }
  } else if (!isRecord(faceDetection) || !Number.isInteger(faceDetection.faceCount) || typeof faceDetection.angle !== 'string' || !['F', 'L', 'R', 'UNCERTAIN'].includes(faceDetection.angle)) errors.push(issue('FACE_RESULT_REQUIRED', 'faceDetection'));
  else if ((faceDetection.faceCount as number) < 1) errors.push(issue('FACE_NOT_DETECTED', 'faceDetection.faceCount'));
  else {
    if (faceDetection.selectedFaceIndex !== undefined && (!Number.isInteger(faceDetection.selectedFaceIndex) || (faceDetection.selectedFaceIndex as number) < 0 || (faceDetection.selectedFaceIndex as number) >= (faceDetection.faceCount as number))) {
      errors.push(issue('SUBJECT_SELECTION_INVALID', 'faceDetection.selectedFaceIndex'));
    } else if ((faceDetection.faceCount as number) > 1 && faceDetection.selectedFaceIndex === undefined) {
      errors.push(issue('SUBJECT_SELECTION_REQUIRED', 'faceDetection.selectedFaceIndex'));
    }
  }

  if (candidate.faceProcessingConsent !== true) errors.push(issue('FACE_CONSENT_REQUIRED', 'faceProcessingConsent'));
  if (candidate.photoRightsConfirmed !== true) errors.push(issue('PHOTO_RIGHTS_REQUIRED', 'photoRightsConfirmed'));
  if (candidate.adultSelfDeclaration !== true) errors.push(issue('ADULT_DECLARATION_REQUIRED', 'adultSelfDeclaration'));

  if (errors.length > 0) return { ok: false, errors, warnings };
  return {
    ok: true,
    errors,
    warnings,
    value: {
      photo: photo as unknown as PhotoMetadata,
      nickname,
      jerseyNumber: jerseyNumber as string,
      position: position as Position,
      handedness: handedness as Handedness,
      faceDetection: subjectDetection !== undefined ? { faceCount: 0, angle: 'UNCERTAIN' } : faceDetection as unknown as FaceDetectionResult,
      ...(subjectDetection !== undefined ? { subjectDetection: subjectDetection as CardInput['subjectDetection'] } : {}),
      faceProcessingConsent: true,
      photoRightsConfirmed: true,
      adultSelfDeclaration: true,
    },
  };
}
