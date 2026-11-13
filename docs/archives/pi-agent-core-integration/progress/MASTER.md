# pi-agent-core Integration — Progress Tracker

> **Task**: Embed `@earendil-works/pi-agent-core@0.83.0` as the loop engine of the inline agent, wrapping the DeepSeek web interface as the model backend with a custom StreamFn, replacing the existing self-built inline-agent loop (keeping execution policy/authorization/rendering); Step A lands now, Step B is recorded as a roadmap.
> **Started**: 2026-07-31
> **Mode**: GITHUB_STANDARD (Labels + Milestones + Issues + PRs, no Project board)
> **Repository**: `zhu1090093659/deepseek-pp`
> **Branch / Worktree**: `spec/pi-agent-core-integration` @ `/Users/zcl/code/deepseek-pp-worktrees/pi-agent-core-integration`

## References

- [Project Overview](../analysis/project-overview.md)
- [Module Inventory](../analysis/module-inventory.md)
- [Risk Assessment](../analysis/risk-assessment.md)
- [Task Breakdown](../plan/task-breakdown.md)
- [Dependency Graph](../plan/dependency-graph.md)
- [Milestones](../plan/milestones.md)
- Baseline references: `docs/archives/deepseek-pp-reliability-compatibility-refactor/` (completed refactor record), `docs/archives/mcp-capability-plane/` (archived just before this run)

## Milestones

| # | Milestone | Target | Criteria | Status |
|:--|:----------|:-------|:---------|:-------|
| 51 | M1 Contracts and foundation ready | After Phase 1 | golden all green with zero production changes; pi pinned at 0.83.0; bundle within red line; guardrail script effective | Pending |
| 52 | M2 Step A complete (pi loop replacement live) | After Phase 5 | ci:quality all green; old loop deleted; prompt:freeze zero diff; golden byte-for-byte identical; registry/AGENTS.md synced | Pending |

## Issue Mapping (Task → Issue → Batch → PR → Status)

| Task | Issue | Delivery Batch | PR | Status |
|:-----|:------|:---------------|:---|:-------|
| A0 (A0-T1 + A0-T2) | [#511](https://github.com/zhu1090093659/deepseek-pp/issues/511) | P1-B1 | [#516](https://github.com/zhu1090093659/deepseek-pp/pull/516) | **Merged (#511 closed)** |
| A1 (A1-T1..3) | [#512](https://github.com/zhu1090093659/deepseek-pp/issues/512) | P2-B1 | [#517](https://github.com/zhu1090093659/deepseek-pp/pull/517) | **Merged (#512 closed)** |
| A2 (A2-T1..3) | [#513](https://github.com/zhu1090093659/deepseek-pp/issues/513) | P3-B1 | [#518](https://github.com/zhu1090093659/deepseek-pp/pull/518) | **Merged (#513 closed)** |
| A3 (A3-T1..3) | [#514](https://github.com/zhu1090093659/deepseek-pp/issues/514) | P4-B1 | [#519](https://github.com/zhu1090093659/deepseek-pp/pull/519) | **Merged (#514 closed)** |
| A2 (A2-T1..3) | [#513](https://github.com/zhu1090093659/deepseek-pp/issues/513) | P3-B1 | — | Open |

| A4 (A4-T1..2) | [#515](https://github.com/zhu1090093659/deepseek-pp/issues/515) | P5-B1 | — | Verifying |

## Delivery Batches

| Batch | Issue | Integration Branch | Validation | Depends On | Status |
|:------|:------|:--------------------|:-----------|:-----------|:-------|
| P1-B1 | #511 | `batch/p1-b1-contract-foundation` | golden + compile + build:chrome + pi-bundle-budget | — | **PR #516 in review** |
| P2-B1 | #512 | `batch/p2-b1-deepseek-stream-fn` | Targeted tests + compile + build:chrome + shake assertions | P1-B1 | **PR #517 merged** |
| P3-B1 | #513 | `batch/p3-b1-tool-bridge-auth` | Targeted tests + compile + prompt:freeze + build | P1-B1 | **PR #518 merged** |
| P4-B1 | #514 | `batch/p4-b1-loop-swap` | Full verification chain (prompt:freeze zero diff → build:all → verify → narrow smoke) + L3 review | P2-B1, P3-B1 | **PR #519 merged** |
| P5-B1 | #515 | `batch/p5-b1-validation-closure` | Full ci:quality chain + fixtures diff + registry/AGENTS.md check | P4-B1 | **Verifying** |

## Quick Status Commands

```bash
# Issues / PRs of this run
gh issue list --repo zhu1090093659/deepseek-pp --label spec:pi-agent-core-integration --state open
# Milestone progress
gh api repos/zhu1090093659/deepseek-pp/milestones --jq '.[] | select(.number==51 or .number==52) | {number,title,open_issues,closed_issues}'
```

## Current Status

**Active Phase**: Phase 5 (P5-B1) verifying
**Active Task**: A4-T2 governance committed (AGENTS.md rules + PR-006 registry row + storage boundary test); A4-T1 full ci:quality chain running
**Blockers**: None

## Governance Status

**Shared instruction surface**: `AGENTS.md` (sole project-level source of truth; root `CLAUDE.md` forbidden)
**Other platform rule surfaces**: No relevant project rule surfaces
**Memory surface**: Codex native memory
**Memory fallback path**: None (AGENTS.md forbids in-repo memory files)
**Main workspace discipline**: The main workspace (`/Users/zcl/code/deepseek-pp`) has uncommitted changes from another Agent (the CP-B1 batch; commit authorization to follow once it finishes); all git operations/file changes in this run happen only inside the worktree, and the main workspace is a read-only reference.

## Execution Telemetry

- Telemetry and drift state are stored per `references/adaptive-control.md`: **Milestone description YAML block** (M1=#51, M2=#52, thresholds annotate/replan/rescope initialized).
- After each task completes: collect actual effort / S.U.P.E.R / unplanned dependencies → write an Issue comment → update the corresponding Milestone YAML drift_score → respond automatically when a threshold is triggered (annotate 20% / replan 40% / rescope 60%).

## Next Steps

1. Start execution after the user confirms (Phase 5a).
2. Execution order: P1-B1 (A0-T1 ∥ A0-T2 dual-lane Tier 2) → P2-B1 → P3-B1 → P4-B1 (L3 review: A3-T2, A2-T3) → P5-B1.
3. One PR per batch (one `Closes #N` line); P4-B1 is the only behavior-replacing PR (rollback boundary), and its prerequisite = A0-T1 golden already green.
4. After everything completes, Phase 6 archives (`docs/archives/pi-agent-core-integration/`) + closes Milestones.

## Session Log

| Date | Session | Summary |
|:--|:--|:--|
| 2026-07-31 | Planning | Archived the MCP capability plane (docs-only commit e809010; code batches left to its main Agent); created worktree `spec/pi-agent-core-integration`; Phase 1 analysis (3 subagents + npm fact-check); Phase 2 decisions (direct replacement / B recorded as roadmap only / consume existing prompt output); Phase 3 decomposition (5 Phases / 13 Tasks / 5 Issues / 5 Batches) + GitHub resources (Labels, M1=#51, M2=#52, Issues #511-#515). |
