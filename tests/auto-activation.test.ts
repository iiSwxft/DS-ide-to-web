// Auto-activation (implicit scoring) switches: normalize invariants + interceptor cadence gating.
// Environment reuses request-augmentation-local.test.ts: no external dependencies, no mocks.
// NOTE: the Chinese description ('适用场景：...') and the '周报' (weekly report) prompt are intentional test INPUT:
// the local-skill scorer still matches Chinese scenario labels and CJK 2-grams (core/skill/local-skill-scorer.ts).

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SKILL_AUTO_ACTIVATION_SETTINGS,
  normalizeSkillAutoActivationSettings,
  type SkillAutoActivationSettings,
} from '../core/skill/auto-activation-settings';
import { augmentRequestBody } from '../core/interceptor/request-augmentation';
import { LOCAL_INDEX_MARKER } from '../core/skill/local-importer';
import type { Skill } from '../core/types';

const LOCAL_INDEX_INSTRUCTIONS = [
  '# Local Skill: demo',
  '',
  `- ${LOCAL_INDEX_MARKER}`,
  '- Skill directory path: /skills/demo',
  '',
  '## Activation Notice',
  '',
  '- Read the Skill definition file with the local file tool: /skills/demo/SKILL.md',
].join('\n');

function localIndexSkill(): Skill {
  return {
    name: 'demo',
    instructions: LOCAL_INDEX_INSTRUCTIONS,
    memoryEnabled: false,
    source: 'remote',
    description: '适用场景：生成周报、日报、总结',
    remote: {
      provider: 'local',
      localDirectory: '/skills/demo',
      localRootPath: '/skills/demo',
    },
  } as unknown as Skill;
}

function baseState(auto: SkillAutoActivationSettings) {
  return {
    memories: [],
    skills: [localIndexSkill()],
    activePreset: null,
    modelType: null,
    toolDescriptors: [] as never[],
    messageCount: 0,
    locale: 'en' as const,
    skillAutoActivation: auto,
  };
}

describe('normalizeSkillAutoActivationSettings (linked invariants)', () => {
  it('default: first message on, every message off', () => {
    expect(DEFAULT_SKILL_AUTO_ACTIVATION_SETTINGS).toEqual({ firstMessage: true, everyMessage: false });
  });

  it('every message on => first message forced on', () => {
    expect(normalizeSkillAutoActivationSettings({ firstMessage: false, everyMessage: true }))
      .toEqual({ firstMessage: true, everyMessage: true });
  });

  it('first message off => every message forced off', () => {
    expect(normalizeSkillAutoActivationSettings({ firstMessage: false, everyMessage: true }))
      .toEqual({ firstMessage: true, everyMessage: true });
    expect(normalizeSkillAutoActivationSettings({ firstMessage: false, everyMessage: false }))
      .toEqual({ firstMessage: false, everyMessage: false });
  });

  it('first-only (every off) is left unchanged', () => {
    expect(normalizeSkillAutoActivationSettings({ firstMessage: true, everyMessage: false }))
      .toEqual({ firstMessage: true, everyMessage: false });
  });

  it('dirty data (non-boolean / undefined) falls back to defaults', () => {
    expect(normalizeSkillAutoActivationSettings(undefined)).toEqual(DEFAULT_SKILL_AUTO_ACTIVATION_SETTINGS);
    expect(normalizeSkillAutoActivationSettings({ firstMessage: 'yes' as unknown as boolean, everyMessage: 1 as unknown as boolean }))
      .toEqual({ firstMessage: false, everyMessage: false });
  });
});

describe('augmentRequestBody auto-activation gating', () => {
  it('both off -> implicit scoring does not fire, original input passes through', () => {
    const result = augmentRequestBody(JSON.stringify({
      prompt: '周报',
      parent_message_id: null,
      thinking_enabled: false,
    }), baseState({ firstMessage: false, everyMessage: false }));
    expect(result!.agentTaskPrompt).toBe('周报');
  });

  it('first-only + first message -> implicit scoring fires, index directive injected', () => {
    const result = augmentRequestBody(JSON.stringify({
      prompt: '周报',
      parent_message_id: null,
      thinking_enabled: false,
    }), baseState({ firstMessage: true, everyMessage: false }));
    expect(result!.agentTaskPrompt).toContain(LOCAL_INDEX_MARKER);
  });

  it('first-only + later message -> implicit scoring does not fire, original input passes through', () => {
    const result = augmentRequestBody(JSON.stringify({
      prompt: '周报',
      parent_message_id: 'abc',
      thinking_enabled: false,
    }), baseState({ firstMessage: true, everyMessage: false }));
    expect(result!.agentTaskPrompt).toBe('周报');
  });

  it('every-message on + later message -> implicit scoring fires, index directive injected', () => {
    const result = augmentRequestBody(JSON.stringify({
      prompt: '周报',
      parent_message_id: 'abc',
      thinking_enabled: false,
    }), baseState({ firstMessage: false, everyMessage: true }));
    expect(result!.agentTaskPrompt).toContain(LOCAL_INDEX_MARKER);
  });

  it('missing skillAutoActivation (DEFAULT first-message on) + first message -> fires', () => {
    const result = augmentRequestBody(JSON.stringify({
      prompt: '周报',
      parent_message_id: null,
      thinking_enabled: false,
    }), {
      memories: [],
      skills: [localIndexSkill()],
      activePreset: null,
      modelType: null,
      toolDescriptors: [],
      messageCount: 0,
      locale: 'en',
    });
    expect(result!.agentTaskPrompt).toContain(LOCAL_INDEX_MARKER);
  });
});
