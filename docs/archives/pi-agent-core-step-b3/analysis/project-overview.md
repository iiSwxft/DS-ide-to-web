# Project Overview — pi-agent-core Step B3: Import of the pi skills/agents ecosystem

> **Run**: spec:pi-agent-core-skills | **Mode**: GITHUB_STANDARD | **Base**: origin/main (35ddb86, B2 archive merged)
> **Date**: 2026-08-05 | **Prerequisite**: B2 complete (dual backends in place)

## Goal

Reuse pi's agents/skills configuration ecosystem: the open-source pi project has a large number of community skills (SKILL.md directory + frontmatter format, agentskills.io spec). DeepSeek++ already has a complete local Skill system (`core/skill/`: registry/codec/parser/local-importer/builtin/auto-activation). B3 = **connect the pi ecosystem's SKILL.md skill format to DeepSeek++'s existing Skill pipeline**, so users can import/reuse community skills, while strictly observing:

- **Single memory authority (constraint 2)**: pi's session/memory is never persisted; skill content enters only DeepSeek++'s existing Skill storage (IndexedDB/local), with no new persistence keys.
- **Prompt byte contract (constraint 5)**: pi's system-prompt templates / `formatSkillsForSystemPrompt` output **must not** enter the wire directly; skill content is injected through the existing `augmentRequestBody`/`buildContinuationPrompt` pipeline (bytes unchanged), and `prompt:freeze` must show zero diff.

**Non-goals**: Do not adopt pi's agents configuration (`~/.pi/agents`) as a runtime source of truth; do not build a second skill registry; do not change the pinned pi version.

## Current State (after B1/B2)

- Inline agent dual backends: `deepseek-web` (default) + `deepseek-api` (official API), both registered via pi-ai providers.
- Project skill system (`core/skill/`): `registry.ts` (skill registry), `codec.ts`, `parser.ts` (`parseSkillCommand`), `local-importer.ts`, `local-path-rewriter.ts`, `builtin.ts`, `bundled-loader.ts`, `auto-activation-settings.ts`, `github-importer.ts`, `officecli-library.ts`, `spec-driven-develop-library.ts`.
- pi ecosystem format (`@earendil-works/pi-agent-core/dist/harness/`):
  - `Skill { name, description, content, filePath, disableModelInvocation? }`; 
  - `loadSkills(env, dirs)`: recursively traverses directories, loads `SKILL.md` + root-level `.md`, parses frontmatter (name/description/disable-model-invocation);
  - `formatSkillsForSystemPrompt(skills)` / `formatSkillInvocation(skill)`: generate agentskills.io-spec XML blocks — **B3 does not consume either output** (prompt templates do not enter the wire).

## B3 Design Decisions

1. **Format bridge, not a runtime dependency**: A pi ecosystem skill = a SKILL.md in the file system (frontmatter + body). B3 adds `core/skill/pi-importer.ts`: parse SKILL.md → the existing DeepSeek++ skill record shape (reusing the record model from `codec.ts`), persisted through `local-importer.ts`'s existing import path. **It does not import the pi-agent-core harness** (avoiding the FileSystem/Shell ExecutionEnv dependency surface; guarded by the size guardrails).
2. **SKILL.md parser**: frontmatter (name/description/disable-model-invocation) + body (content); reuse the project's existing YAML/markdown parsing surface (no new dependencies); directory recursion rules match pi's `loadSkills` (SKILL.md first, root-level .md as fallback).
3. **Prompt injection reuses the existing pipeline**: Imported skills go through the existing augmentation path (the skills section of `augmentRequestBody`); `prompt:freeze` zero diff must run.
4. **No new persistence keys**: Skills are stored in the existing `core/skill` storage; `tests/pi-storage-boundary.test.ts` guard unchanged.
5. **Size**: pi-importer does not import the pi package (pure parser); guardrail probe extension measured.

## Risk Carry-over (B3 increment)

| # | Risk | Probability | Impact | Mitigation |
|:--|:-----|:----:|:----:|:-----|
| (p1) | Dual-track memory/session (pi session persisted) | Low | High | pi context is only working memory (existing rule); skill content enters only the existing Skill storage; no new persistence keys |
| (p2) | Prompt byte contract broken (pi system-prompt templates enter the wire) | Low | High | Disable `formatSkillsForSystemPrompt`/`formatSkillInvocation` output (grep assertion); prompt:freeze zero diff |
| (p3) | Import format compatibility (frontmatter variants/encoding/nesting) | Medium | Medium | Parser contract tests (valid/malformed/unknown fields — malformed marked current-gap); reuse the project's YAML surface |
| (p4) | Size (importing the pi harness drags in dependencies) | Medium | Medium | pi-importer has zero pi dependencies (pure parsing); guardrail probe measurement |
| (p5) | Community skill content safety (instruction injection) | Medium | High | Skills are local content explicitly imported by the user (same trust surface as existing local skills); never auto-executed, only injected into the prompt; covered by existing authorization/sanitization paths |

## Acceptance Direction

- `prompt:freeze` zero diff; golden 10/10;
- SKILL.md import pipeline targeted tests all green (parse/persist/inject);
- `pi-bundle-budget` all green (including the pi-importer probe, no pi harness leak);
- No new persistence keys (pi-storage-boundary maintained);
- One independent Issue authorization per change (this run = the single SKILL.md ecosystem import one).

## References

- `docs/archives/pi-agent-core-step-b1/`, `docs/archives/pi-agent-core-step-b2/` (B1/B2 archives)
- `docs/archives/pi-agent-core-integration/` (Step A archive)
- `AGENTS.md` (stable pi-agent-core integration rules)
- `step-b-handoff.md` (handoff document)
