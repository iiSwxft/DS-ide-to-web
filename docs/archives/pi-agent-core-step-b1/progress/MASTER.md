# pi-agent-core Integration Step B1 — Progress Tracker

> **Task**: Register the deepseek-web model backend as a formal pi-ai provider (`createProvider` + `Provider<'deepseek-web'>`), moving away from the custom-StreamFn-only path; first item of Step B (B1 → B2 → B3).
> **Started**: 2026-08-05
> **Mode**: GITHUB_STANDARD (Labels + Milestones + Issues + PRs, no Project board)
> **Repository**: `zhu1090093659/deepseek-pp`
> **Branch / Worktree**: `spec/pi-agent-core-provider` @ `/Users/zcl/code/deepseek-pp-worktrees/pi-agent-core-step-b`
> **Base**: origin/main (c283e49 — Step A archive #521 merged)

## References

- [Project Overview](../analysis/project-overview.md)
- [Risk Assessment](../analysis/risk-assessment.md)
- [Task Breakdown](../plan/task-breakdown.md)
- [Milestones](../plan/milestones.md)
- Handoff: `step-b-handoff.md`; Step A archive: `docs/archives/pi-agent-core-integration/`

## Milestones

| # | Milestone | Target | Criteria | Status |
|:--|:----------|:-------|:---------|:-------|
| 1 | M-B1 deepseek-web formal provider registration complete | After P3-B1 | Guardrails all green + golden 10/10 + existing path unchanged + contract tests + freeze zero diff + B2 start conditions | Pending |

## Issue Mapping

| Task | Issue | Delivery Batch | PR | Status |
|:-----|:------|:---------------|:---|:-------|
| B1-T1..T2 | [#522](https://github.com/zhu1090093659/deepseek-pp/issues/522) | P1-B1 | [#523](https://github.com/zhu1090093659/deepseek-pp/pull/523) | **Merged** |
| B1-T3..T4 | [#522](https://github.com/zhu1090093659/deepseek-pp/issues/522) | P2-B1 | [#524](https://github.com/zhu1090093659/deepseek-pp/pull/524) | **Merged** |
| B1-T5..T7 | [#522](https://github.com/zhu1090093659/deepseek-pp/issues/522) | P3-B1 | [#525](https://github.com/zhu1090093659/deepseek-pp/pull/525) | PR in review |

## Delivery Batches

| Batch | Tasks | Integration Branch | Validation | Depends On | Status |
|:------|:------|:--------------------|:-----------|:-----------|:-------|
| P1-B1 | B1-T1..T2 | `batch/b1-p1-provider-contract` | Targeted tests + compile (zero production changes) | — | **Merged (#523)** |
| P2-B1 | B1-T3..T4 | `batch/b1-p2-provider-impl` | Targeted tests + compile + build:chrome + guardrails | P1-B1 | **Merged (#524)** |
| P3-B1 | B1-T5..T7 | `batch/b1-p3-loop-wiring` | Full verification chain + golden + ci:quality | P2-B1 | PR #525 in review |

## Quick Status Commands

```bash
gh issue list --repo zhu1090093659/deepseek-pp --label spec:pi-agent-core-provider --state open
```

## Current Status

**Active Phase**: Phase 3 (P3-B1 wiring complete, PR #525 in review)
**Active Task**: B1-T7 (ci:quality wrap-up + Issue closure)
**Blockers**: None

## Governance Status

**Shared instruction surface**: `AGENTS.md` (sole project-level source of truth)
**Main workspace discipline**: The main workspace (`/Users/zcl/code/deepseek-pp`) is a read-only reference; all git operations in this run happen only inside the worktree.

## Session Log

| Date | Session | Summary |
|:--|:--|:--|
| 2026-08-05 | Planning | Read the handoff document + Step A archive (MASTER/milestones/risk/task-breakdown); fact-checked the pi-ai 0.83.0 provider system (models.js createProvider, types.d.ts Api/ProviderStreams, auth/types, lazy.js); created worktree `spec/pi-agent-core-provider`; wrote analysis/plan/progress docs. |
