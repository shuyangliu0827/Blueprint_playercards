import { describe, expect, test } from 'vitest';
import storyConfigJson from '../config/story_templates.json';
import { buildStory, validateStoryConfig } from '../src/core/story.js';

const config = validateStoryConfig(storyConfigJson);

describe('card-back story', () => {
  test('builds a deterministic 2–3 sentence story no longer than 80 Unicode characters', () => {
    const first = buildStory({ nickname: '阿杰', jerseyNumber: '00', position: 'PG', templateIndex: 0 }, config);
    const replay = buildStory({ nickname: '阿杰', jerseyNumber: '00', position: 'PG', templateIndex: 0 }, config);
    expect(first).toBe(replay);
    expect(first.split('。').filter(Boolean)).toHaveLength(3);
    expect(Array.from(first)).toHaveLength(54);
    expect(Array.from(first).length).toBeLessThanOrEqual(80);
  });

  test('uses only supplied profile fields and makes no team, statistics, or signature claims', () => {
    const story = buildStory({ nickname: 'MARCUS', jerseyNumber: '07', position: 'C', templateIndex: 1 }, config);
    expect(story).toContain('MARCUS');
    expect(story).toContain('07');
    expect(story).toContain('中锋');
    expect(story).not.toMatch(/场均|赛季|球队|签名|冠军|得分|篮板|助攻/);
  });

  test('keeps template sentence count structural when a Latin nickname contains periods', () => {
    const story = buildStory({ nickname: 'J.R.', jerseyNumber: '07', position: 'C', templateIndex: 1 }, config);
    expect(story).toContain('J.R.');
    expect(config.templates[1]?.sentences).toHaveLength(2);
  });

  test('uses gender-neutral template wording', () => {
    const story = buildStory({ nickname: '阿杰', jerseyNumber: '00', position: 'PG', templateIndex: 0 }, config);
    expect(story).not.toContain('他');
    expect(story).not.toContain('她');
  });
});

describe('story configuration validation', () => {
  test.each([
    null,
    {},
    { ...storyConfigJson, maxUnicodeCharacters: 81 },
    { ...storyConfigJson, templates: [] },
    { ...storyConfigJson, templates: [{ id: 'bad', sentences: ['only one。'] }] },
    { ...storyConfigJson, templates: [{ id: 'bad', sentences: ['{unknown}。', 'ok。'] }] },
    { ...storyConfigJson, templates: [{ id: 'bad', sentences: [`{nickname}${'很'.repeat(70)}。`, '继续。'] }] },
    { ...storyConfigJson, templates: [{ id: 'bad', sentences: ['第一句。第二句。', '第三句。'] }] },
    { ...storyConfigJson, templates: [{ id: 'bad', sentences: ['First. Second。', '第三句。'] }] },
    { ...storyConfigJson, templates: [{ id: 'bad', sentences: ['一。', '二。', '三。', '四。'] }] },
    { ...storyConfigJson, templates: [{ id: 'bad', sentences: ['{nickname。', '继续。'] }] },
    { ...storyConfigJson, templates: [{ id: 'bad', sentences: ['nickname}。', '继续。'] }] },
    { ...storyConfigJson, positionLabels: { ...storyConfigJson.positionLabels, C: '中.锋' } },
  ])('rejects malformed or altered story config', (candidate) => {
    expect(() => validateStoryConfig(candidate)).toThrow();
  });
});
