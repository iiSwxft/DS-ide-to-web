// T3 integration test for the local-index Skill activation branch (goes through the exported augmentRequestBody real path).
// Covers:
//   1) Implicit branch: user input triggers implicit scoring activation of a local-index Skill, injecting "index instructions + D4 boundary".
//   2) An explicit /skillname hit on a local-index Skill likewise goes through composeLocalSkillPrompt (index instructions + D4 boundary).
//   3) Index-shape detection: isLocalIndexInstructions distinguishes "index import" from the "legacy frozen snapshot".
//   4) Isolation guarantee: legacy snapshots (no marker) / builtin / github sources are not affected by implicit scoring; behavior is unchanged.
//
// Environment reused from request-augmentation.test.ts: toolDescriptors: [] / memories: [] / locale: 'en', no external deps, no mocks.
//
// NOTE: the Chinese descriptions/prompts (e.g. '周报' = "weekly report") are deliberate test INPUT: the scorer reuses the
// Chinese-aware tokenizer from capability-projection (whole CJK sentence as one token, substring match).

import { describe, expect, it } from 'vitest';
import { isLocalIndexInstructions, LOCAL_INDEX_MARKER } from '../core/skill/local-importer';
import { augmentRequestBody } from '../core/interceptor/request-augmentation';
import type { Skill } from '../core/types';

const LOCAL_INDEX_INSTRUCTIONS = [
  '# Local Skill: demo',
  '',
  '## DeepSeek++ Import Metadata',
  '',
  `- ${LOCAL_INDEX_MARKER}`,
  '- Skill directory path: /skills/demo',
  '',
  '## Activation Notice',
  '',
  '- Read the Skill definition file with the local file tool: /skills/demo/SKILL.md',
  '',
  '## Local Execution Boundary',
  '',
  '- Run commands with cwd set to the Skill directory path: /skills/demo',
].join('\n');

const LEGACY_SNAPSHOT_INSTRUCTIONS = [
  '# Local Skill: legacy',
  '',
  'This is the old frozen snapshot body (no index marker).',
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

function legacyLocalSkill(): Skill {
  return {
    name: 'legacy',
    instructions: LEGACY_SNAPSHOT_INSTRUCTIONS,
    memoryEnabled: false,
    source: 'remote',
    description: '适用场景：生成周报',
    remote: {
      provider: 'local',
      localDirectory: '/skills/legacy',
      localRootPath: '/skills/legacy',
    },
  } as unknown as Skill;
}

function builtinSkill(): Skill {
  return {
    name: 'writer',
    instructions: 'You are a writing assistant.',
    memoryEnabled: false,
    source: 'builtin',
    description: '适用场景：生成周报',
  } as unknown as Skill;
}

function githubSkill(): Skill {
  return {
    name: 'gh',
    instructions: 'GitHub skill body.',
    memoryEnabled: false,
    source: 'github',
    description: 'GitHub integration',
    remote: { provider: 'github' },
  } as unknown as Skill;
}

describe('isLocalIndexInstructions (index-shape detection)', () => {
  it('contains index marker → true', () => {
    expect(isLocalIndexInstructions(LOCAL_INDEX_INSTRUCTIONS)).toBe(true);
  });

  it('legacy snapshot without marker → false', () => {
    expect(isLocalIndexInstructions(LEGACY_SNAPSHOT_INSTRUCTIONS)).toBe(false);
  });

  it('undefined / empty → false', () => {
    expect(isLocalIndexInstructions(undefined)).toBe(false);
    expect(isLocalIndexInstructions('')).toBe(false);
  });
});

describe('augmentRequestBody local-index Skill activation branch', () => {
  it('implicit branch: user input scores a hit on the local-index Skill → injects index instructions + D4 boundary', () => {
    // Note: the scorer reuses capability-projection's tokenizer (a whole Chinese sentence becomes one token, substring match),
    // so the query must be a substring of the Skill description/scenario (here '周报' = "weekly report").
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

    expect(result).not.toBeNull();
    // agentTaskPrompt must be "index instructions + D4 boundary", not the raw user input.
    expect(result!.agentTaskPrompt).toContain(LOCAL_INDEX_MARKER);
    expect(result!.agentTaskPrompt).toContain('## Local Execution Boundary');
    expect(result!.agentTaskPrompt).toContain('/skills/demo');
    expect(result!.agentTaskPrompt).not.toBe('周报');
    // The final request body also contains the injected content.
    const bodyPrompt = JSON.parse(result!.body).prompt as string;
    expect(bodyPrompt).toContain(LOCAL_INDEX_MARKER);
    expect(bodyPrompt).toContain('## Local Execution Boundary');
  });

  it('explicit /demo hit on the local-index Skill → also injects the D4 boundary', () => {
    const result = augmentRequestBody(JSON.stringify({
      prompt: '/demo 写本周周报',
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

    expect(result).not.toBeNull();
    expect(result!.agentTaskPrompt).toContain('## Local Execution Boundary');
    expect(result!.agentTaskPrompt).toContain(LOCAL_INDEX_MARKER);
  });

  it('legacy snapshot (no index marker) is not activated by implicit scoring → raw input passes through', () => {
    const original = '帮我生成本周周报';
    const result = augmentRequestBody(JSON.stringify({
      prompt: original,
      parent_message_id: null,
      thinking_enabled: false,
    }), {
      memories: [],
      skills: [legacyLocalSkill()],
      activePreset: null,
      modelType: null,
      toolDescriptors: [],
      messageCount: 0,
      locale: 'en',
    });

    expect(result!.agentTaskPrompt).toBe(original);
  });

  it('builtin source is not affected by implicit scoring → raw input passes through', () => {
    const original = '帮我生成本周周报';
    const result = augmentRequestBody(JSON.stringify({
      prompt: original,
      parent_message_id: null,
      thinking_enabled: false,
    }), {
      memories: [],
      skills: [builtinSkill()],
      activePreset: null,
      modelType: null,
      toolDescriptors: [],
      messageCount: 0,
      locale: 'en',
    });

    expect(result!.agentTaskPrompt).toBe(original);
  });

  it('github source explicit hit → instructions pass through unchanged, no D4 boundary injected', () => {
    const result = augmentRequestBody(JSON.stringify({
      prompt: '/gh do something',
      parent_message_id: null,
      thinking_enabled: false,
    }), {
      memories: [],
      skills: [githubSkill()],
      activePreset: null,
      modelType: null,
      toolDescriptors: [],
      messageCount: 0,
      locale: 'en',
    });

    expect(result!.agentTaskPrompt).toContain('GitHub skill body.');
    expect(result!.agentTaskPrompt).not.toContain('## Local Execution Boundary');
  });
});

describe('augmentRequestBody exposes activeLocalSkillDir (Plan A closed-loop source)', () => {
  it('implicit hit on the local-index Skill → activeLocalSkillDir equals skillDir', () => {
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

    expect(result).not.toBeNull();
    expect(result!.activeLocalSkillDir).toBe('/skills/demo');
  });

  it('explicit /demo hit on the local-index Skill → activeLocalSkillDir equals skillDir', () => {
    const result = augmentRequestBody(JSON.stringify({
      prompt: '/demo 写本周周报',
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

    expect(result!.activeLocalSkillDir).toBe('/skills/demo');
  });

  it('no local Skill activated (builtin / legacy snapshot) → activeLocalSkillDir is undefined', () => {
    const builtin = augmentRequestBody(JSON.stringify({
      prompt: '帮我生成本周周报',
      parent_message_id: null,
      thinking_enabled: false,
    }), {
      memories: [],
      skills: [builtinSkill()],
      activePreset: null,
      modelType: null,
      toolDescriptors: [],
      messageCount: 0,
      locale: 'en',
    });
    const legacy = augmentRequestBody(JSON.stringify({
      prompt: '帮我生成本周周报',
      parent_message_id: null,
      thinking_enabled: false,
    }), {
      memories: [],
      skills: [legacyLocalSkill()],
      activePreset: null,
      modelType: null,
      toolDescriptors: [],
      messageCount: 0,
      locale: 'en',
    });

    expect(builtin!.activeLocalSkillDir).toBeUndefined();
    expect(legacy!.activeLocalSkillDir).toBeUndefined();
  });
});
