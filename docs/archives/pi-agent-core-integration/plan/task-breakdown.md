# Task Breakdown — pi-agent-core Integration Step A

## Overview
- **Total Phases**: 5
- **Total Tasks**: 13 (grouped into 5 Issues: A0–A4)
- **Planned Delivery Batches / PRs**: 5 (one PR per batch, one `Closes #N` line per PR)
- **Estimated Total Effort**: L (10×M + 2×L + 2×S)
- **Workspace**: worktree `/Users/zcl/code/deepseek-pp-worktrees/pi-agent-core-integration` (branch `spec/pi-agent-core-integration`); uncommitted changes from other Agents in the main workspace are never touched (read-only reference excepted).

## S.U.P.E.R Design Constraints

> All tasks carry the implicit acceptance: "pass the S.U.P.E.R Quick Check of the listed principles". The bullseyes of this run (from risk-assessment): **R** (AGENT_* contract hardening → loop replaceability), **E** (evidence that the pi narrow entry bundles), **U** (authorization direction red line: pi may only call downward through the existing `executeTool(call, grantId)` port, and pi holding authorization/page state in reverse is an architecture-level violation).

- **S**: The StreamFn is a "thin adapter" with a single responsibility — it does not duplicate fetch/framing/PoW/SSE logic (`stream-codec.ts` is the sole authority).
- **U**: Data flows one way input→processing→output; the pi layer never imports browser/DOM/provider implementations.
- **P**: Contract first — the StreamFn port, event mapping, and config mapping define their schemas before implementation; cross-module I/O is serializable; contract modules must not import concrete implementations.
- **E**: All new dependencies are declared explicitly; pi dependencies go only through narrow entries; no hardcoded paths/URLs.
- **R**: Replacement test — "the pi engine can be swapped out by touching only this module".

## Testing and Governance Constraints

- **Test default**: All tasks in this run involve behavior/contract/dependency changes → all require automated tests; the only exception is A4-T2 (docs/governance, with the N/A reason and latest verification noted).
- **Verification order (AGENTS.md, landed in each task's acceptance)**: targeted tests → `compile` → `prompt:freeze` (when prompt/tool/inline-agent are involved) → `build:all` (cross-browser/wrap-up) → `verify:manifest-policy`/`verify:extension-utf8` → narrow smoke → wrap-up `ci:quality`. Hard 60s timeout for unit tests.
- **Prompt bytes unchanged (invariant C)**: `prompt:freeze` must show zero diff; any diff needs Issue authorization + `prompt:freeze:update` + manual review.
- **Fixtures sync obligation (invariant E)**: runtime-contract (AGENT_* bridge records/tool-record), external-runtime (DS route/SSE), and persistence-contract (pi has no new persistence keys) sync with contract changes.
- **Governance**: GITHUB_STANDARD (Labels + Milestones + Issues + PRs, no Project board); Labels: `spec:pi-agent-core-integration` + `spec-driven` + priority/size/phase/lane.
- **Memory surface**: Codex native memory (no in-repo memory files); stable rules are consolidated into AGENTS.md uniformly in A4-T2.

## Phase 1: Contract first and dependency probing (Issue A0)

**Goal**: With zero production behavior change, lock the AGENT_* event protocol into a golden contract, and introduce `@earendil-works/pi-agent-core@0.83.0` into the dependency tree with an exact pin, proving that the narrow entry bundles and the size is controllable.
**Prerequisite**: None (the very start of this run).
**S.U.P.E.R Focus**: R (contract hardening → replaceability) + E (evidence that the dependency bundles).

| # | Task | Priority | Effort | Depends On | Lane | Delivery Batch | S.U.P.E.R | Test Expectation | Memory Impact | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:-----|:---------------|:----------|:-----------------|:--------------|:--------------------|
| A0-T1 | AGENT_* event protocol golden contract test (contract first, zero production code changes) | P0 | M | — | A | P1-B1 | R, P | New `tests/inline-agent-event-protocol-golden.test.ts` | Protocol contract state recorded in native memory; registry records "AGENT_* protected by contract tests" (record row only) | 8-scenario golden all green; `compile` clean; 0 lines changed in production code (git diff only in tests/); event payload shapes correspond field by field to `types.ts`; verification order: targeted tests → compile |
| A0-T2 | pi-agent-core@0.83.0 exact pin + narrow-entry probing + size guardrails | P0 | M | — | B | P1-B1 | E, S | Probe script/tests + `scripts/pi-bundle-budget.mjs` | Pinning/upgrade policy recorded in native memory (formal AGENTS.md rules left to A4-T2) | `"@earendil-works/pi-agent-core": "0.83.0"` (no `^`) + `overrides` pinning transitive dependencies; `build:chrome` passes; bundle raw/gzip within the red line (background ≤820K/240K); pi increment guardrail calibrated by measurement; probing conclusions written into the A0 Issue |

**A0-T1 details**: 8 scenarios (natural completion / tool execution / natural reply without tools / nudge chain / nudge budget exhausted / abort silent completion / error path / DSML+fallback parsing and 12k stream event truncation), capturing the full event sequences + payload snapshots of the 7 message types (AGENT_STEP_STARTED / AGENT_STREAM_CHUNK / AGENT_TOOL_DETECTED / AGENT_TOKEN_SPEED / AGENT_STEP_COMPLETE / AGENT_LOOP_COMPLETE / AGENT_LOOP_ERROR) as golden; keep using the existing `vi.mock('../core/deepseek/adapter')` seam (the mock surface is unchanged after A3 replacement, so scenarios are reusable).

### Parallel Lanes (Phase 1)
| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:-----|:------|:----------------|:-----------|:----------|
| A (Contract lane) | A0-T1 | M | Low (new in tests/, zero overlap) | `tests/inline-agent-event-protocol-golden.test.ts` |
| B (Dependency lane) | A0-T2 | M | Low (package.json/lockfile/scripts/) | `package.json`, `scripts/pi-bundle-budget.mjs` |

## Phase 2: StreamFn model backend adaptation (Issue A1)

**Goal**: Wrap the DS web interface as a pi model backend with a thin adapter (internally reusing `active-client.submitPromptStreaming` and `stream-codec`, without duplicating protocol logic); this phase **does not wire into the loop** (production behavior unchanged).
**Prerequisite**: A0 merged (pi installed, contract hardened).
**S.U.P.E.R Focus**: P (port first) + S (thin adapter single responsibility).

| # | Task | Priority | Effort | Depends On | Lane | Delivery Batch | S.U.P.E.R | Test Expectation | Memory Impact | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:-----|:---------------|:----------|:-----------------|:--------------|:--------------------|
| A1-T1 | StreamFn port definition (contract module, zero implementation dependencies) | P0 | S | A0-T2 | S1 | P2-B1 | P, U | Compile-time exported type assertion tests (risk (a) version drift defense) | StreamFn boundary definition recorded in native memory | Port types are serializable and consumed by A1-T2/A3; the contract module's import surface is pure types only (grep assertion); compile green |
| A1-T2 | DeepSeekStreamFn thin adapter implementation | P0 | L | A1-T1 | S1 | P2-B1 | P, E, S | `tests/stream-fn-adapter.test.ts` (event mapping/truncation/abort/retry-only-without-chunk/token speed pass-through) | "stream-codec.ts is the sole protocol authority; StreamFn does not duplicate protocol logic" recorded in native memory | Depends only on the port + active-client + stream-codec pure functions; not connected to the loop; targeted tests + compile green |
| A1-T3 | StreamFn ↔ pi event stream mapping contract tests + narrow-entry tree-shake tests | P1 | M | A1-T2 | S1 | P2-B1 | R | Mapping table tests (each AssistantMessageEventStream event ↔ the corresponding AGENT_*) + bundle shake assertion tests | Mapping table recorded in native memory (reused by the A3 event translation layer) | Mapping table documented (in the A1 Issue); tests green; artifact has no heavy pi-ai SDKs (assertion test) |

**Verification chain for this phase** (batch level): targeted tests → compile → build:chrome (prompt:freeze is not run — no inline-agent behavior change, reason recorded in the Issue).

## Phase 3: Tool bridging and authorization fidelity (Issue A2)

**Goal**: All pi tool execution maps to the existing authorization path (`executeTool(call, grantId)`, via the `ToolLoopExecuteTool` injection surface of `tool-loop/engine`, inventing no second execution path); tool results are normalized into `ToolExecutionRecord`; the fork-preventing fail-closed is carried by the adapter layer.
**Prerequisite**: A0 merged.
**S.U.P.E.R Focus**: U (authorization direction red line) + P (record shape schema).

| # | Task | Priority | Effort | Depends On | Lane | Delivery Batch | S.U.P.E.R | Test Expectation | Memory Impact | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:-----|:---------------|:----------|:-----------------|:--------------|:--------------------|
| A2-T1 | pi AgentTool → existing execution surface bridge | P0 | M | A0-T2 | S1 | P3-B1 | U, S | `tests/pi-tool-bridge.test.ts` (XML/DSML dual protocols, ToolCall.source is only a routing declaration) | Authorization direction invariant (pi may only call downward) recorded in native memory | Consumes only the `ToolLoopExecuteTool` injection surface; invariant B; targeted tests + compile green |
| A2-T2 | Tool result normalization + session-chain fail-closed + budget mapping | P0 | M | A2-T1 | S1 | P3-B1 | P, U | Normalization unit tests (`ToolExecutionRecord` shape unchanged) + chat-active-loop linkage test extension | Ownership of the fork-prevention defense (adapter layer) recorded in native memory | `responseMessageId===null && toolCalls>0` → refuse execution (proven by new-path tests); budget constants (25/8/120s/2.5–6.5s/4 windows) mapping table landed; prompt:freeze zero diff |
| A2-T3 | Authorization path regression tests (every tool call goes through the grant) | P0 | M | A2-T1 | S1 | P3-B1 | U | Extend `tool-authorization.test.ts`/`background-tool-authorization-integration` | None (AGENTS.md already has the red line; tests strengthened) | Test anchor for risk (f) in place; authorization chain integration tests all green |

**Verification chain for this phase** (batch level): targeted tests → compile → **prompt:freeze (tool behavior involved)** → build.

## Phase 4: Loop engine replacement (Issue A3) — single-batch PR replacement (rollback boundary)

**Goal**: `runInlineAgentLoop` is changed to drive pi's `agentLoop` (custom StreamFn + hooks injecting the existing `buildContinuationPrompt`/`buildNudgePrompt` output, with pi templates disabled); delete the old self-built loop body; the AGENT_* event sequence is byte-for-byte identical to golden.
**Prerequisite**: A1 and A2 merged.
**S.U.P.E.R Focus**: R (replacement) + U (direction) + P (config mapping schema).

| # | Task | Priority | Effort | Depends On | Lane | Delivery Batch | S.U.P.E.R | Test Expectation | Memory Impact | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:-----|:---------------|:----------|:-----------------|:--------------|:--------------------|
| A3-T1 | pi loop adapter layer (config/hooks/budget mapping) | P0 | L | A1-T2, A2-T2 | S1 | P4-B1 | P, S, U | `tests/pi-loop-adapter.test.ts`; grep asserts pi templates are not referenced | "pi context serves only as current-turn working memory, with no new persistence" recorded in native memory (risk h) | agentLoop wiring complete but entry not replaced (independently verifiable); hooks inject existing prompt output; compaction disabled / windowed compression semantics; abort silent; targeted tests + compile + prompt:freeze green |
| A3-T2 | Replace the `runInlineAgentLoop` body (delete old loop) | P0 | M | A3-T1 | S1 | P4-B1 | R, U | The existing `inline-agent-loop.test.ts` all switched to run on the new engine (mock surface kept at the adapter layer); golden comparison | No additions (old loop deletion = single authority implemented) | loop.ts left with only the assembly layer (pi engine + StreamFn + bridge + event translation); old self-built loop body deleted (git diff confirms no residue); post/executeTool port signatures and abort semantics unchanged; **L3 independent review APPROVED/FIXED** |
| A3-T3 | Dual-track regression and golden alignment | P1 | M | A3-T2 (baseline A0-T1) | S1 | P4-B1 | R | golden all green on the new engine (sequence + payload byte-for-byte identical); full inline-agent behavior test surface regression | Event translation layer mapping table finalized and recorded in native memory | AGENT_* sequence byte-for-byte identical to before replacement; abort silent, budget notice, truncation suffix, windowed compression semantics identical; prompt:freeze zero diff |

**Verification chain for this phase** (batch level, following the full AGENTS.md order): targeted tests → compile → **prompt:freeze (mandatory, zero diff; stop on any diff, go through Issue authorization + manual review)** → **build:all (three browsers)** → verify:manifest-policy + verify:extension-utf8 → narrow smoke (affected runtimes: smoke:pow / smoke:web / inline-agent smoke path, at least one real command or tool call) → ci:quality left for A5.

## Phase 5: Verification wrap-up (Issue A4)

**Goal**: Full verification chain + size guardrails effective + fixtures/registry/instruction surface sync + archive preparation.
**Prerequisite**: A3 merged.
**S.U.P.E.R Focus**: R (regression closure) + E (cross-browser, reproducible).

| # | Task | Priority | Effort | Depends On | Lane | Delivery Batch | S.U.P.E.R | Test Expectation | Memory Impact | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:-----|:---------------|:----------|:-----------------|:--------------|:--------------------|
| A4-T1 | Full verification and fixtures sync | P0 | M | A3-T3 | S1 | P5-B1 | R, E | `ci:quality` full chain of 21 segments; fixtures sync (runtime-contract/external-runtime/persistence-contract); narrow smoke with real calls | None | ci:quality all green; all fixtures diffs have authorization basis (invariant E); pi has no new IndexedDB/localStorage keys (grep assertion) |
| A4-T2 | Governance and documentation wrap-up (registry/AGENTS.md/memory/archive) | P1 | S | A4-T1 | S1 | P5-B1 | E | N/A (docs/governance; reason: no runtime code change, latest verification = ci:quality already green; supplementary static checks: link/checklist inspection) | AGENTS.md adds stable rules: ① pi exact-pin upgrade policy ② pi context not persisted ③ StreamFn obligation to reuse stream-codec; docs/compatibility registry updated; native memory synced; archive preparation | AGENTS.md/registry diff reviewed and merged; no in-repo memory files; archive checklist ready |

## Parallel Lanes Summary (whole run)

| Lane | Phase | Tasks | Combined Effort | Merge Risk | Key Files |
|:-----|:------|:------|:----------------|:-----------|:----------|
| P1-Lane A (Contract lane) | 1 | A0-T1 | M | Low (new in tests/) | `tests/inline-agent-event-protocol-golden.test.ts` |
| P1-Lane B (Dependency lane) | 1 | A0-T2 | M | Low (package.json/lockfile/scripts/) | `package.json`, `scripts/pi-bundle-budget.mjs` |
| P2-Lane S1 | 2 | A1-T1 → T2 → T3 | L | — (new, sequential) | `core/inline-agent/pi/stream-fn-port.ts`, `deepseek-stream-fn.ts`, tests |
| P3-Lane S1 | 3 | A2-T1 → T2 ∥ T3 | M+ | Low–Mid | `core/inline-agent/pi/tool-bridge.ts`, `tests/pi-tool-bridge.test.ts`, tool-authorization test surface |
| P4-Lane S1 | 4 | A3-T1 → T2 → T3 | L+ | — (single-file replacement of loop.ts, **parallelism strictly forbidden**) | `core/inline-agent/loop.ts`, `core/inline-agent/pi/loop-adapter.ts` |
| P5-Lane S1 | 5 | A4-T1 → T2 | M | — | `tests/fixtures/**`, `docs/compatibility/**`, `AGENTS.md` |

**Parallel/serial conclusions**:
- ✅ Parallelizable: **only A0-T1 ∥ A0-T2** (zero file overlap, Tier 2 dual lane); A2-T2 ∥ A2-T3 (low overlap).
- ❌ Not parallelizable: within A1 (T1→T2→T3 hard dependency); within A3 (single-file replacement of loop.ts, strictly sequential); all cross-batch (each batch depends on the previous batch merging).

## Delivery Batches

| Batch | Tasks / Issue | Execution Waves | Goal and Grouping Rationale | Integration Branch | Combined Validation | Depends On | Split / Single-Issue Rationale |
|:------|:--------------|:----------------|:----------------------------|:-------------------|:--------------------|:-----------|:-------------------------------|
| P1-B1 | A0-T1, A0-T2 / #A0 | W1: Lane A + Lane B in parallel | Zero-behavior-change "contract + foundation" PR | `batch/p1-b1-contract-foundation` | golden all green + compile + build:chrome + pi-bundle-budget green | — | Test-only + dependency-only combination, clean review surface, independently revertible |
| P2-B1 | A1-T1..3 / #A1 | W1: T1 → W2: T2 → W3: T3 | StreamFn adaptation surface landed independently (purely additive, not wired) | `batch/p2-b1-deepseek-stream-fn` | Targeted tests + compile + build:chrome + shake assertions | P1-B1 | Separated from A2: each an independent adaptation surface; merging them would make the PR too large |
| P3-B1 | A2-T1..3 / #A2 | W1: T1 → W2: T2 ∥ T3 | Authorization fidelity as an independent review focus (security red line, paired with L3) | `batch/p3-b1-tool-bridge-auth` | Targeted tests + compile + prompt:freeze + build | P1-B1 | Authorization red-line changes need an independent review focus |
| P4-B1 | A3-T1..3 / #A3 | W1: T1 → W2: T2 → W3: T3 (strictly sequential) | **The only "behavior replacement" batch = rollback boundary** | `batch/p4-b1-loop-swap` | Full verification chain (prompt:freeze zero diff → build:all → verify → narrow smoke) | P2-B1, P3-B1 | Single-batch PR replacement as specified by the user; reverting the single PR rolls back; golden is the safety net |
| P5-B1 | A4-T1..2 / #A4 | W1: T1 → W2: T2 | Wrap-up: full verification + governance sync | `batch/p5-b1-validation-closure` | Full ci:quality chain + fixtures diff + registry/AGENTS.md check | P4-B1 | The wrap-up batch is independent of feature code |

> One PR per batch, each PR body containing a `Closes #A#` line (exactly one Issue per batch). The rationale for single-Issue batches is recorded batch by batch (hard dependency chain + risk isolation + rollback boundary).
