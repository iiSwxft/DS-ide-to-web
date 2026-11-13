// T5 D1 path rewriter unit tests.
// Covers: joinUnderRoot dual-base / out-of-bounds, isAbsolutePath, and absolutizeSkillReferences:
// "dual-base probing absolutization", "URLs/anchors/absolute paths/home-dir placeholders are not rewritten", "missing files are kept as-is", "references inside code blocks (fenced/inline) are skipped".
//
// Self-consistent contract (Review #3, route A): this rewriter only acts on the "index instruction text injected into the Agent context" (see the
// header of local-path-rewriter.ts); it does not cover the real SKILL.md body of a local Skill or the contents of its references files. Relative
// references in the real body rely on the Agent following the D4 soft prompt's "double-base rule" to resolve them. The describe at the end of this
// file explicitly anchors this contract boundary.
//
// Note: some test inputs below were originally Chinese link text; they are plain markdown text and are not tied to Chinese-specific logic.
//
// Design source: local-skill-import-design.md §2.5. Algorithm (dual-base probing):
//   1) join(thisFileDir, rel) first; if fileExists -> use it;
//   2) otherwise join(skillDir, rel); if fileExists -> use it;
//   3) if neither exists -> keep as-is (do not clobber URLs / absolute paths / placeholders / `..` escapes).

import { describe, expect, it } from 'vitest';
import {
  absolutizeSkillReferences,
  isAbsolutePath,
  joinUnderRoot,
} from '../core/skill/local-path-rewriter';

describe('joinUnderRoot', () => {
  it('joins a relative path under the root', () => {
    expect(joinUnderRoot('/skills/demo', 'references/guide.md')).toBe('/skills/demo/references/guide.md');
  });

  it('resolves one level up (..)', () => {
    expect(joinUnderRoot('/skills/demo', '../sibling.md')).toBe('/skills/sibling.md');
  });

  it('out of bounds (escapes root) -> null', () => {
    expect(joinUnderRoot('/skills/demo', '../../../escape.md')).toBeNull();
  });

  it('keeps the dot (.)', () => {
    expect(joinUnderRoot('/skills/demo', './guide.md')).toBe('/skills/demo/guide.md');
  });
});

describe('isAbsolutePath', () => {
  it('Windows drive letter is treated as an absolute path', () => {
    expect(isAbsolutePath('C:\\skills\\demo')).toBe(true);
    expect(isAbsolutePath('D:/skills/demo')).toBe(true);
  });

  it('Unix-like absolute path', () => {
    expect(isAbsolutePath('/skills/demo')).toBe(true);
  });

  it('relative path / home-dir placeholder is not an absolute path', () => {
    expect(isAbsolutePath('references/guide.md')).toBe(false);
    expect(isAbsolutePath('~/notes.md')).toBe(false);
  });
});

describe('absolutizeSkillReferences', () => {
  const skillDir = '/skills/demo';
  const thisFileDir = '/skills/demo/sub';

  it('dual-base probing: thisFileDir hit takes priority', () => {
    const text = 'See [Guide](references/guide.md)';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir,
      fileExists: (abs) => abs === '/skills/demo/sub/references/guide.md',
    });
    expect(out).toBe('See [Guide](/skills/demo/sub/references/guide.md)');
  });

  it('dual-base probing: falls back to skillDir when thisFileDir misses', () => {
    const text = 'See [Guide](references/guide.md)';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir,
      fileExists: (abs) => abs === '/skills/demo/references/guide.md',
    });
    expect(out).toBe('See [Guide](/skills/demo/references/guide.md)');
  });

  it('neither base exists -> kept as-is', () => {
    const text = 'See [Guide](references/guide.md)';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir,
      fileExists: () => false,
    });
    expect(out).toBe(text);
  });

  it('URLs are not rewritten', () => {
    const text = 'See [Docs](https://example.com/guide.md)';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir,
      fileExists: () => true,
    });
    expect(out).toBe(text);
  });

  it('anchors are not rewritten', () => {
    const text = 'See [Section](#section)';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir,
      fileExists: () => true,
    });
    expect(out).toBe(text);
  });

  it('already-absolute paths are not rewritten', () => {
    const text = 'See [Docs](/already/absolute.md)';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir,
      fileExists: () => true,
    });
    expect(out).toBe(text);
  });

  it('home-dir placeholder (~) is not rewritten', () => {
    const text = 'See [Notes](~/notes.md)';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir,
      fileExists: () => true,
    });
    expect(out).toBe(text);
  });

  it('relative path escaping the skillDir root -> not rewritten (escape guard)', () => {
    const text = 'See [Escape](../../etc/secrets.md)';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir,
      fileExists: () => true,
    });
    expect(out).toBe(text);
  });

  it('rewrites multiple references at once', () => {
    const text = 'See [A](a.md) and [B](b.md)';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir: skillDir,
      fileExists: (abs) => abs === '/skills/demo/a.md' || abs === '/skills/demo/b.md',
    });
    expect(out).toBe('See [A](/skills/demo/a.md) and [B](/skills/demo/b.md)');
  });

  it('skips pseudo-links inside fenced code blocks (not rewritten)', () => {
    const text = [
      'See [Real link](references/guide.md)',
      '',
      '```',
      'Example: [example](references/guide.md)',
      '```',
    ].join('\n');
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir,
      fileExists: (abs) => abs === '/skills/demo/references/guide.md',
    });
    // The real link outside code is rewritten; the example link inside the code block keeps its relative path.
    expect(out).toContain('[Real link](/skills/demo/references/guide.md)');
    expect(out).toContain('[example](references/guide.md)');
    // The code block structure stays intact.
    expect(out).toContain('```');
  });

  it('skips pseudo-links inside inline code (not rewritten)', () => {
    const text = 'Note: `[example](references/guide.md)` is an example, while [Real link](references/guide.md) will be rewritten.';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir,
      fileExists: (abs) => abs === '/skills/demo/references/guide.md',
    });
    expect(out).toContain('`[example](references/guide.md)`');
    expect(out).toContain('[Real link](/skills/demo/references/guide.md)');
  });
});

describe('Self-consistent contract boundary (Review #3, route A): only acts on injected index instruction text', () => {
  const skillDir = '/skills/demo';

  it('index instruction layer (file in the known manifest) -> absolutized normally (design coverage boundary)', () => {
    // Simulates the index instruction text injected by composeLocalSkillPrompt: thisFileDir=skillDir, fileExists hits the manifest
    const text = 'See [Guide](references/guide.md)';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir: skillDir,
      fileExists: (abs) => abs === '/skills/demo/references/guide.md',
    });
    expect(out).toBe('See [Guide](/skills/demo/references/guide.md)');
  });

  it('real body layer (file not in the augment manifest -> fileExists=false) -> kept as-is, not enforced at this layer', () => {
    // Simulates the real SKILL.md body after being read via local_file_read: this rewriter is not called at the disk-read injection boundary.
    // If it is passed in anyway (fileExists returning false means not in the registered manifest), relative references stay as-is,
    // and the Agent resolves them itself following the D4 "double-base rule" - reflecting "self-consistent contract: the real body is not covered".
    const text = 'See [Appendix](./appendix/notes.md) and [Example](examples/demo.md)';
    const out = absolutizeSkillReferences(text, {
      skillDir,
      thisFileDir: `${skillDir}/refs`,
      fileExists: () => false,
    });
    expect(out).toBe(text);
  });

  it('GAP-1 pinned: index instruction rewriting is isolated from the real body; the call site only passes the index card', () => {
    // Contract (request-augmentation.ts:268 composeLocalSkillPrompt): the only call site of absolutizeSkillReferences receives just
    // skill.instructions (the index card generated at import time), never the real body read back by local_file_read.
    // Even if the real body contains resolvable relative references, as long as they are not registered in the injected manifest (fileExists=false),
    // this layer does not force a rewrite, and the Agent resolves them itself following the D4 "double-base rule". This test pins that isolation
    // boundary to prevent a regression to "covering the real body".
    const indexCard = 'See [Guide](references/guide.md)'; // Index card: in the manifest -> rewritten
    const realBody = 'Body: see [Appendix](./appendix/notes.md)'; // Real body: not in the manifest -> kept
    const rewrittenIndex = absolutizeSkillReferences(indexCard, {
      skillDir,
      thisFileDir: skillDir,
      fileExists: (abs) => abs === '/skills/demo/references/guide.md',
    });
    const untouchedBody = absolutizeSkillReferences(realBody, {
      skillDir,
      thisFileDir: `${skillDir}/refs`,
      fileExists: () => false, // Real body is not in the injected manifest
    });
    expect(rewrittenIndex).toBe('See [Guide](/skills/demo/references/guide.md)');
    expect(untouchedBody).toBe(realBody);
  });
});
