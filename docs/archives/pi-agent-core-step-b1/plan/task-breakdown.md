# Task Breakdown — pi-agent-core Step B1: deepseek-web provider registration

## Overview

- **Total Phases**: 4 | **Total Tasks**: 7 (grouped into 1 Issue) | **Delivery Batches / PRs**: 3 (one PR per batch, one `Closes #N` line per PR)
- **Estimated Total Effort**: M+ (4×S + 2×M + 1×L)
- **Workspace**: worktree `/Users/zcl/code/deepseek-pp-worktrees/pi-agent-core-step-b` (branch `spec/pi-agent-core-provider`); the main workspace is a read-only reference and is never touched.
- **Prerequisite**: Step A merged (c283e49); pi pinned at 0.83.0, unchanged.

## Design Constraints (S.U.P.E.R + AGENTS.md)

- **P** Contract first: the provider port (deps shape, registration shape, stream delegation contract) comes before implementation.
- **S** The provider module has a single responsibility: only "registration surface + delegation"; it does not duplicate stream-codec/active-client protocol logic.
- **E** New dependency surface (models.js/createProvider) must be measured with a probe for size; heavy API modules are forbidden in the static graph.
- **R** Golden contract guard: the wiring batch must pass golden 10/10 plus all existing StreamFn tests.
- Verification order (F): targeted tests → compile → prompt:freeze → build:all → verify:* → narrow smoke → ci:quality.

## Phase 1: Provider port definition and contract tests (Issue B1)

**Goal**: With zero production behavior change, lock the shape of "deepseek-web registered as a pi-ai provider" into contract tests.
**S.U.P.E.R Focus**: P + R.

| # | Task | Priority | Effort | Depends On | Delivery Batch | S.U.P.E.R | Test Expectation | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:---------------|:----------|:-----------------|:--------------------|
| B1-T1 | Provider port definition (`core/inline-agent/pi/provider-port.ts` or an extension of stream-fn-port): `DeepSeekWebProviderDeps`, `DeepSeekWebProviderFactory` (`(deps) => Provider<'deepseek-web'>`), pure types | P0 | S | — | P1-B1 | P, U | Compile-time exported type assertion test (`Provider<'deepseek-web'>` assignable, deps constructible) | The contract module's import surface is only the pi package + pure-type relative imports (grep assertion); compile green; 0 lines changed in production code |
| B1-T2 | Provider registration shape contract test (`tests/deepseek-web-provider.test.ts`): createProvider output shape (id/api/models/auth/stream delegation), consistency of streamSimple and stream, auth resolve semantics (token → headers; no token → undefined) | P0 | M | B1-T1 | P1-B1 | R, P | Registration shape + auth semantics unit tests (mock deps) | Tests green; tests do not import the production provider implementation (define first, implement later) |

**Verification chain for this phase**: targeted tests → compile (production unchanged, no build/prompt needed; reasoning recorded).

## Phase 2: Provider registration implementation (Issue B1)

**Goal**: Implement `createDeepSeekWebProvider(deps)` — reuse `createDeepSeekStreamFn`/`createDeepSeekTurnSubmitter` and register with `createProvider`.
**S.U.P.E.R Focus**: S + E.

| # | Task | Priority | Effort | Depends On | Delivery Batch | S.U.P.E.R | Test Expectation | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:---------------|:----------|:-----------------|:--------------------|
| B1-T3 | `core/inline-agent/pi/deepseek-web-provider.ts`: `createDeepSeekWebProvider(deps)` → `Provider<'deepseek-web'>` (`createProvider({ id: 'deepseek-web', auth, models, api: { stream, streamSimple } })`); auth.resolve reads the injected token provider; static model catalog with 2 entries | P0 | M | B1-T1 | P2-B1 | S, E | `tests/deepseek-web-provider.test.ts` all switched to run against the real implementation; grep asserts no openai-completions/pi template references | Targeted tests + compile green; provider output shape matches the Phase 1 contract; loop not wired (production behavior unchanged) |
| B1-T4 | Size probe extension: add a provider probe to `pi-bundle-budget.mjs` (or extend the adapter probe to import `createDeepSeekWebProvider`) and calibrate the budget | P1 | S | B1-T3 | P2-B1 | E | Probe measured-increment report; guardrails green | Guardrail script green; measured increment recorded in the Issue; no node:/SDK leaks |

**Verification chain for this phase**: targeted tests → compile → build:chrome → pi-bundle-budget.

## Phase 3: loop-adapter wiring + golden regression (Issue B1)

**Goal**: `runPiInlineAgentLoop` gets its model + stream from `createDeepSeekWebProvider`; the AGENT_* event sequence is byte-for-byte identical to golden.
**S.U.P.E.R Focus**: R (Replaceable) + U.

| # | Task | Priority | Effort | Depends On | Delivery Batch | S.U.P.E.R | Test Expectation | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:---------------|:----------|:-----------------|:--------------------|
| B1-T5 | loop-adapter wiring: replace the hand-built `Model` construction + direct `createDeepSeekStreamFn` with provider-registry retrieval; keep the `pacedStreamFn` wrapper | P0 | L | B1-T3 | P3-B1 | R, U | `inline-agent-event-protocol-golden.test.ts` 10/10; `stream-fn-adapter.test.ts`/`stream-fn-event-mapping.test.ts` all green | golden 10/10 byte-for-byte; behavior unchanged; prompt:freeze zero diff |
| B1-T6 | Full verification + size guardrails + fixtures check | P1 | M | B1-T5 | P3-B1 | R, E | `npm run compile`; `prompt:freeze`; `build:all`; `verify:manifest-policy`/`verify:extension-utf8`; `pi-bundle-budget` (three browsers); narrow smoke | Full chain green; no unexpected fixtures diff (AGENT_* payloads unchanged); no new persistence keys |

**Verification chain for this phase** (full): targeted tests → compile → prompt:freeze (zero diff) → build:all → verify:* → narrow smoke.

## Phase 4: Wrap-up and archive (Issue B1)

| # | Task | Priority | Effort | Depends On | Delivery Batch | S.U.P.E.R | Test Expectation | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:---------------|:----------|:-----------------|:--------------------|
| B1-T7 | ci:quality + governance wrap-up (Issue closure, docs/plan complete, archive preparation) | P1 | S | B1-T6 | P3-B1 (along with P3) | E | N/A (wrap-up; latest verification = B1-T6 full chain green) | ci:quality green (if applicable); Issue acceptance checklist all ticked; B2 start conditions recorded (provider registered + contract tests in place) |

## Delivery Batches

| Batch | Tasks / Issue | Integration Branch | Combined Validation | Depends On | Rationale |
|:------|:--------------|:--------------------|:--------------------|:-----------|:----------|
| P1-B1 | B1-T1..T2 / #B1 | `batch/b1-p1-provider-contract` | Targeted tests + compile | — | Contract first, zero production change, clean review surface |
| P2-B1 | B1-T3..T4 / #B1 | `batch/b1-p2-provider-impl` | Targeted tests + compile + build:chrome + guardrails | P1-B1 | Implementation + measured size evidence, not wired |
| P3-B1 | B1-T5..T7 / #B1 | `batch/b1-p3-loop-wiring` | Full verification chain + golden + ci:quality | P2-B1 | The only batch that touches behavior (rollback boundary: reverting the single PR restores the previous state) |

> One PR per batch, each PR body containing a `Closes #B1` line; all three batches share the same Issue (the acceptance checklist spans them).
