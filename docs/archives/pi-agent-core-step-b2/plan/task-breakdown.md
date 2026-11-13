# Task Breakdown — pi-agent-core Step B2: Official API Second Model Backend

## Overview

- **Total Phases**: 4 | **Total Tasks**: 7 (grouped into 1 Issue) | **Delivery Batches / PRs**: 3
- **Estimated Total Effort**: L (4×S + 2×M + 1×L)
- **Workspace**: worktree `/Users/zcl/code/deepseek-pp-worktrees/pi-agent-core-step-b2` (branch `spec/pi-agent-core-official-api`)
- **Prerequisite**: B1 complete (deepseek-web provider registered); pi pinned at 0.83.0, unchanged.

## Design Constraints (S.U.P.E.R + AGENTS.md)

- **P** Contract first: the official API StreamFn port (deps shape, message mapping, chain authority declaration) comes before implementation.
- **S** The provider module has a single responsibility: only registration surface + delegation, without duplicating official-api protocol logic.
- **U** Tool authorization direction unchanged: tools in official API mode still go through tool-bridge → background grant.
- **E** The new dependency surface (official API client entering content) must be measured with a probe for size.
- **R** Golden guard: default web path 10/10; the official API is a side-path addition (independently revertible).

## Phase 1: Official API StreamFn port and message mapping contract (Issue B2)

| # | Task | Priority | Effort | Depends On | Delivery Batch | S.U.P.E.R | Test Expectation | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:---------------|:----------|:-----------------|:--------------------|
| B2-T1 | Official API StreamFn port definition (`core/inline-agent/pi/official-api-port.ts` or an extension of stream-fn-port): `DeepSeekApiStreamFnDeps` (apiKey provider, config provider, message mapper, reasoning callback), `DeepSeekApiProviderFactory` pure types | P0 | S | — | P1-B2 | P, U | Compile-time exported type assertions | Contract module has zero implementation dependencies (grep assertion); compile green; production unchanged |
| B2-T2 | Message mapping contract tests: pi `Message[]` ↔ `OfficialDeepSeekMessage[]` field by field (role/content/reasoningContent; toolResult normalized to a user message + tool result text; thinking toggle) | P0 | M | B2-T1 | P1-B2 | P, R | Mapping table tests all green | Mapping table documented; tests green; production unchanged |

## Phase 2: Official API provider implementation (Issue B2)

| # | Task | Priority | Effort | Depends On | Delivery Batch | S.U.P.E.R | Test Expectation | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:---------------|:----------|:-----------------|:--------------------|
| B2-T3 | `core/inline-agent/pi/official-api-provider.ts`: `createDeepSeekApiProvider(deps)` → `Provider<'deepseek-api'>`, thin wrapper over `submitOfficialDeepSeekStreaming` (messages passed straight through + onReasoningChunk → thinking events + onTextChunk → text events); auth = apiKey resolution | P0 | M | B2-T1 | P2-B2 | S, E | `tests/deepseek-api-provider.test.ts` (registration shape + stream delegation + reasoning pass-through + auth) | Targeted tests + compile green; loop not wired (production behavior unchanged) |
| B2-T4 | Size probe extension: add `createDeepSeekApiProvider` to the provider probe; calibrate the budget | P1 | S | B2-T3 | P2-B2 | E | Probe measured-increment report | Guardrails green; no node:/SDK leaks |

## Phase 3: loop-adapter dual-backend selection + chain adaptation (Issue B2)

| # | Task | Priority | Effort | Depends On | Delivery Batch | S.U.P.E.R | Test Expectation | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:---------------|:----------|:-----------------|:--------------------|
| B2-T5 | loop-adapter backend selection: payload adds `modelBackend?: 'web' \| 'official-api'` (defaults to web to keep golden unchanged); official API mode goes through `createDeepSeekApiProvider`; chain authority = pi Context (validate that Context contains a valid assistant message before tool execution, fail-closed) | P0 | L | B2-T3 | P3-B2 | R, U | golden 10/10 (web path); official API backend targeted tests (tool loop, reasoning, fail-closed, abort) | Single authority for dual-backend selection; golden 10/10; prompt:freeze zero diff |
| B2-T6 | User switching wiring: the caller (where content.ts startInlineAgentLoop constructs the payload) sets modelBackend based on whether `getDeepSeekApiKey()` is set (consistent with chat); no new UI | P1 | M | B2-T5 | P3-B2 | U | Unit/integration tests for payload construction | Switching semantics consistent with chat; zero change on the default web path |
| B2-T7 | Full verification: compile + prompt:freeze + build:all + verify:* + guardrails (3 browsers) + narrow smoke + fixtures check | P1 | M | B2-T5 | P3-B2 | R, E | Full ci:quality chain (if applicable) | Full chain green; no unexpected fixtures diff; no new persistence keys |

## Delivery Batches

| Batch | Tasks / Issue | Integration Branch | Combined Validation | Depends On | Rationale |
|:------|:--------------|:--------------------|:--------------------|:-----------|:----------|
| P1-B2 | B2-T1..T2 / #B2 | `batch/b2-p1-official-contract` | Targeted tests + compile | — | Contract first, production unchanged |
| P2-B2 | B2-T3..T4 / #B2 | `batch/b2-p2-official-impl` | Targeted tests + compile + build:chrome + guardrails | P1-B2 | Implementation + measured size evidence, not wired |
| P3-B2 | B2-T5..T7 / #B2 | `batch/b2-p3-dual-backend` | Full verification chain + golden | P2-B2 | The only batch that touches behavior (rollback boundary) |

> One PR per batch, each PR body containing a `Closes #B2` line; all three batches share the same Issue (the acceptance checklist spans them).
