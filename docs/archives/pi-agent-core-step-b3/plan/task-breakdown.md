# Task Breakdown — pi-agent-core Step B3: Import of the pi skills/agents ecosystem

## Overview

- **Total Phases**: 3 | **Total Tasks**: 6 (grouped into 1 Issue) | **Delivery Batches / PRs**: 3
- **Estimated Total Effort**: M (2×S + 2×M + 1×L)
- **Workspace**: worktree `/Users/zcl/code/deepseek-pp-worktrees/pi-agent-core-step-b3` (branch `spec/pi-agent-core-skills`)
- **Prerequisite**: B2 complete (dual backends in place); pi pinned at 0.83.0, unchanged.

## Current State Check (2026-08-05, determines B3 scope)

**Key fact**: The project's `core/skill/local-importer.ts` **already fully supports** SKILL.md directory import — `parseSkillDoc` (BOM stripping + frontmatter name/description/version + body + H1 fallback + parent directory fallback), `previewLocalSkillSource`/`pickLocalSkillFolder`/`importLocalSkillSource` (recursive directories + index mode + local_file activation), and `findSkillPaths` in `github-importer.ts` (repository scanning). This is **format-compatible** with the pi ecosystem's SKILL.md (agentskills.io spec).

**The actual B3 increment** (not a new parser):
1. **Contract hardening**: `parseSkillDoc` is an internal function, and frontmatter parsing behavior is only tested indirectly (local-skill-importer.test.ts, 21 cases, including a BOM case). B3 exports the parsing surface + adds dedicated SKILL.md parsing contract tests (frontmatter variants/malformed/unknown fields/nested directories).
2. **pi-specific field bridging**: pi's `disable-model-invocation` frontmatter field — the project has no such concept (enabling/disabling is user-controlled). B3 parses it into a `metadata` key (without changing model-visibility semantics), and marks unknown fields as `current-gap`.
3. **Verify ecosystem compatibility**: Community pi skill directories (SKILL.md format) can be used directly through the existing import path — proven by contract tests + the full verification chain.

## Phase 1: SKILL.md parsing contract hardening (Issue B3)

| # | Task | Priority | Effort | Depends On | Delivery Batch | S.U.P.E.R | Test Expectation | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:---------------|:----------|:-----------------|:--------------------|
| B3-T1 | Export the SKILL.md parsing surface (public `parseSkillMarkdown` function wrapping the existing parseSkillDoc logic, behavior unchanged) + parsing contract tests (frontmatter name/description/version/body, H1/parent directory fallback, BOM, malformed frontmatter marked current-gap, unknown fields) | P0 | M | — | P1-B3 | P, R | `tests/pi-skill-importer.test.ts` parsing contract all green | Parsing behavior consistent with existing import (the existing 21 local-skill-importer tests stay green); compile green |
| B3-T2 | pi field bridging contract: mapping rule tests for `disable-model-invocation` → metadata key; zero-reference grep assertion for `formatSkillsForSystemPrompt`/`formatSkillInvocation` | P0 | S | B3-T1 | P1-B3 | P, C | Bridge mapping + grep assertion tests | Mapping table documented; zero-reference assertion for pi templates green |

## Phase 2: pi-importer bridge implementation (Issue B3)

| # | Task | Priority | Effort | Depends On | Delivery Batch | S.U.P.E.R | Test Expectation | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:---------------|:----------|:-----------------|:--------------------|
| B3-T3 | `core/skill/pi-importer.ts`: `parsePiSkillMarkdown` (wraps the B3-T1 parsing surface + pi frontmatter field bridging) — **zero pi dependencies** (does not import @earendil-works/*); community skill directory import goes through the existing `previewLocalSkillSource`/`importLocalSkillSource` | P0 | M | B3-T1 | P2-B3 | S, E | `tests/pi-skill-importer.test.ts` all switched to run against the real implementation | Targeted tests + compile green; grep asserts no @earendil-works import; not wired (production behavior unchanged) |
| B3-T4 | Size probe: add a pi-importer probe to the guardrail script (including the local-importer graph) and calibrate | P1 | S | B3-T3 | P2-B3 | E | Probe measured-increment report | Guardrails green; no node:/SDK leaks |

## Phase 3: Wiring and full verification (Issue B3)

| # | Task | Priority | Effort | Depends On | Delivery Batch | S.U.P.E.R | Test Expectation | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:---------------|:----------|:-----------------|:--------------------|
| B3-T5 | Wiring: the community skill import entry reuses the existing local-importer call surface (UI/commands unchanged, only documenting "supports pi ecosystem SKILL.md directories"); prompt injection goes through the existing augmentation pipeline (no new injection path needed) | P0 | L | B3-T3 | P3-B3 | U, C | golden 10/10; prompt:freeze zero diff; existing local-skill tests all green | No pi templates into the wire (grep assertion); augmentation contract tests green after importing ecosystem skills |
| B3-T6 | Full verification + storage boundary + fixtures check | P1 | M | B3-T5 | P3-B3 | R, E | compile + prompt:freeze + build:all + verify:* + guardrails + narrow smoke + ci:quality | Full chain green; pi-storage-boundary maintained; no unexpected fixtures diff |

## Delivery Batches

| Batch | Tasks / Issue | Integration Branch | Combined Validation | Depends On | Rationale |
|:------|:--------------|:--------------------|:--------------------|:-----------|:----------|
| P1-B3 | B3-T1..T2 / #B3 | `batch/b3-p1-skill-contract` | Targeted tests + compile | — | Contract hardening, zero production change (export does not change behavior) |
| P2-B3 | B3-T3..T4 / #B3 | `batch/b3-p2-skill-impl` | Targeted tests + compile + build:chrome + guardrails | P1-B3 | Bridge implementation + measured size evidence, not wired |
| P3-B3 | B3-T5..T6 / #B3 | `batch/b3-p3-skill-wiring` | Full verification chain + golden + prompt:freeze | P2-B3 | The only batch that touches behavior (rollback boundary) |

> One PR per batch, each PR body containing a `Closes #B3` line; all three batches share the same Issue (the acceptance checklist spans them).
