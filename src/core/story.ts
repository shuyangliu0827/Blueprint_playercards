import type { Position } from './input.js';

export interface StoryTemplate { readonly id: string; readonly sentences: readonly string[] }
export interface StoryConfig {
  readonly version: 'v0';
  readonly maxUnicodeCharacters: 80;
  readonly positionLabels: Readonly<Record<Position, string>>;
  readonly templates: readonly StoryTemplate[];
}

const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const allowedPlaceholders = new Set(['nickname', 'jerseyNumber', 'positionLabel']);
const unsupportedClaims = /场均|赛季|球队|签名|冠军|得分|篮板|助攻/u;
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export function validateStoryConfig(value: unknown): StoryConfig {
  if (!isRecord(value) || Object.keys(value).sort().join('|') !== ['version', 'maxUnicodeCharacters', 'positionLabels', 'templates'].sort().join('|')) throw new Error('story config is malformed');
  if (value.version !== 'v0' || value.maxUnicodeCharacters !== 80 || !isRecord(value.positionLabels) || !Array.isArray(value.templates) || value.templates.length === 0) throw new Error('story config does not match confirmed v0 values');
  const positionLabels = value.positionLabels;
  if (Object.keys(positionLabels).sort().join('|') !== [...positions].sort().join('|') || positions.some((position) => typeof positionLabels[position] !== 'string' || String(positionLabels[position]).length === 0 || /[。！？.!?]/u.test(String(positionLabels[position])))) throw new Error('position labels are malformed');
  const ids = new Set<string>();
  const templates = value.templates.map((template, index) => {
    if (!isRecord(template) || Object.keys(template).sort().join('|') !== 'id|sentences' || typeof template.id !== 'string' || template.id.length === 0 || ids.has(template.id) || !Array.isArray(template.sentences) || template.sentences.length < 2 || template.sentences.length > 3) throw new Error(`story template ${index} is malformed`);
    ids.add(template.id);
    const sentences = template.sentences.map((sentence) => {
      if (typeof sentence !== 'string' || !/[。！？.!?]$/u.test(sentence) || (sentence.match(/[。！？.!?]/gu) ?? []).length !== 1 || unsupportedClaims.test(sentence)) throw new Error(`story template ${index} contains an invalid sentence`);
      const placeholders = [...sentence.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]);
      if (placeholders.some((placeholder) => placeholder === undefined || !allowedPlaceholders.has(placeholder))) throw new Error(`story template ${index} contains an unknown placeholder`);
      const withoutValidPlaceholders = sentence.replace(/\{(?:nickname|jerseyNumber|positionLabel)\}/gu, '');
      if (/[{}]/u.test(withoutValidPlaceholders)) throw new Error(`story template ${index} contains unmatched placeholder braces`);
      return sentence;
    });
    const longestPositionLabel = positions.reduce((longest, position) => {
      const label = String(positionLabels[position]);
      return Array.from(label).length > Array.from(longest).length ? label : longest;
    }, '');
    const longestRenderedStory = sentences.join('')
      .replaceAll('{nickname}', 'N'.repeat(14))
      .replaceAll('{jerseyNumber}', '00')
      .replaceAll('{positionLabel}', longestPositionLabel);
    if (Array.from(longestRenderedStory).length > 80) throw new Error(`story template ${index} can exceed 80 Unicode characters`);
    return { id: template.id, sentences };
  });
  return { version: 'v0', maxUnicodeCharacters: 80, positionLabels: positionLabels as unknown as Record<Position, string>, templates };
}

export function buildStory(input: { readonly nickname: string; readonly jerseyNumber: string; readonly position: Position; readonly templateIndex: number }, config: StoryConfig): string {
  if (!Number.isInteger(input.templateIndex) || input.templateIndex < 0 || input.templateIndex >= config.templates.length) throw new Error('templateIndex is out of range');
  const template = config.templates[input.templateIndex];
  if (!template) throw new Error('story template is missing');
  const replacements: Record<string, string> = { nickname: input.nickname, jerseyNumber: input.jerseyNumber, positionLabel: config.positionLabels[input.position] };
  const story = template.sentences.join('').replace(/\{([^}]+)\}/gu, (_, key: string) => replacements[key] ?? '');
  if (Array.from(story).length > config.maxUnicodeCharacters) throw new Error('rendered story exceeds 80 Unicode characters');
  return story;
}
