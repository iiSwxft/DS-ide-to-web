# Risk Assessment — pi-agent-core Integration

## S.U.P.E.R Architecture Health Summary

| Principle | Status | Key Findings | Transformation Priority |
|:----------|:-------|:-------------|:------------------------|
| **S** Single Purpose | 🟡 | inline-agent is one module with many responsibilities (loop/prompt/policy/render/trace); pi-agent-core is a "multi-purpose monolith" (loop+harness+session+compaction+tools in a single package) | Medium |
| **U** Unidirectional Flow | 🟡 | The authorization dependency direction is a red line: the pi loop may only call downward through the existing `executeTool` port, and pi holding authorization/page state in reverse is an architecture-level violation; fetch-hook is a global mutable singleton with implicit callbacks | High |
| **P** Ports over Implementation | 🟢 | The `DeepSeekAutomationClient` port already exists (adapter.ts has degraded to a facade); the deepseek codec is a pure-function single authority and serializable | Low |
| **E** Environment-Agnostic | 🟡 | pi-agent-core dist has no `node:` imports (a good sign), but engines≥22.19 and the dependency chain contains Node-oriented SDKs; MV3 content/SW has no Node runtime, so build artifact evidence is needed | High |
| **R** Replaceable Parts | 🟡 | The replaceability of loop.ts depends on the coupling of the AGENT_* event sequence with trace/renderer/auto-save, but there is **no event protocol contract test** (the weakest link of R) | High |

**Overall Health**: 3/5 principles healthy — Refactoring Needed (refactoring bullseye: R (add event contract), E (prove browser bundling), U (authorization direction discipline))

### S.U.P.E.R Violation Hotspots

1. **inline-agent has no loop event protocol golden**: The AGENT_* event sequence + payloads only have behavior tests. The contract must be locked down before replacing the loop, otherwise R cannot hold.
2. **Risk of wide-entry import of pi-agent-core**: The `.` entry does `export *` of all submodules, dragging in pi-ai 681K and SDKs such as AWS/Anthropic; a narrow entry + tree-shake measurement + size guardrails are required.
3. **fetch-hook.ts, 1461 lines with many responsibilities**: (fetch/XHR/IDB hooks + SSE filtering + metrics + history wiring) Not a refactoring target of this run, but the StreamFn must not duplicate its logic and may only reuse stream-codec.
4. **loop.ts directly coupled to adapter at function level**: When replacing the engine, the seam must be made explicit as the `DeepSeekAutomationClient` port.

## Risk Matrix

| # | Risk | Probability | Impact | Mitigation direction |
|:--|:-------|:----:|:----:|:---------|
| (a) | pi-mono version drift (0.83.0 iterates fast) | Medium | High | Pin the exact version + lockfile + `overrides` pinning transitive dependencies; StreamFn/type boundary contract tests (compile-time exported type assertions); upgrades go through a separate PR rerunning the full verification chain |
| (b) | Bundle size (pi-core 271K + pi-ai 681K; background headroom ≈187K raw/59K gzip) | High | High | Import only from narrow entries (agent-loop/types/stream-fn), keeping harness/tools/session/compaction out of the bundle; measure raw/gzip for three browsers after integration; extend the budget script to cover content/background; use dynamic chunks if needed |
| (c) | Old/new loop dual-track regression | Medium | High | Add loop event protocol contract tests first; dual-track only as a development-time feature flag, single authority in production; delete the old loop once migration completes (AGENTS.md L45) |
| (d) | Prompt byte contract change (using pi's built-in prompt-templates directly would break the PR-002/004/005 freeze) | High | High | The pi loop must consume the existing `buildContinuationPrompt`/`buildNudgePrompt` output (injected via StreamFn/PrepareNextTurn), with pi templates disabled; `prompt:freeze` must run; byte changes go through `prompt:freeze:update` + Issue authorization |
| (e) | DS web private protocol change | Medium | High | Make the StreamFn a thin adapter that internally reuses `active-client.submitPromptStreaming` (the sole protocol authority) without duplicating fetch/framing; protocol contract tests + external-runtime fixtures sync |
| (f) | Tool authorization path bypassed (security red line) | Medium | High | All pi tool execution maps to the existing `executeTool(call, grantId)`; add tests proving every tool call goes through the grant's one-time reservation; refuse execution if no grant is obtained |
| (g) | Page session and loop context split (chain fork/edit/regenerate confusion) | High | High | pi context serves only as "current-turn working memory"; session identity/message IDs follow the page session; keep the "refuse tool execution without responseMessageId" fail-closed; add chat-active-loop/edit/regenerate linkage tests |
| (h) | Dual-track memory (pi session/memory-repo vs IndexedDB memory v30) | Medium | Medium | pi context is only in-loop working memory and does not land on new persistence paths; IndexedDB stays the single authority; sync persistence-contract fixtures |
| (i) | content context lifecycle/performance (25 steps × 120s, nudge, abort, SPA navigation/BFCache, long main-thread tasks) | Medium | Medium-High | Keep content-capability idempotent start/stop and abort propagation; keep budget constants/truncation semantics as-is; the pi loop holds no DOM/observer/timers (left to the content layer) |

## Invariants Checklist (from AGENTS.md, hard constraints for this run)

- **A (inline-agent semantics)**: Preserve continuation/finalization semantics and user-visible behavior (`<original_task>`/`<tool_results>`/`<task_complete>`/truncation suffix/windowed compression/placeholders), unless an Issue explicitly authorizes byte changes; the AGENT_* event protocol and the consumer contracts of trace-codec/trace-store/auto-save/renderer are unchanged; abort completes silently; the execution policy (`selectContinuableToolExecutions`) and budget constants are retained.
- **B (tool authorization security red line)**: Every production tool execution must go through the runtime authorization path (background grant: receiver-owned document/session + descriptor snapshot + provider/mode/risk + request identity + one-time reservation); caller ToolCall metadata is not authorization evidence; MAIN-world payloads are untrusted; no second execution path may be invented.
- **C (prompt byte contract)**: Prompt byte output/tool XML tags/augmentation order are frozen; `prompt:freeze` is a read-only check, and golden updates go only through `prompt:freeze:update` + Issue authorization + manual diff review; `prompt:freeze` must run when inline-agent behavior is affected.
- **D (SSE/route contract)**: `stream-codec.ts` is the sole authority for the DS Web protocol; requests are independent with no automatic replay; no retry after a chunk has been received (to prevent forks); the official API contract is frozen; page auth reads only `localStorage.userToken` and never rewrites page storage.
- **E (fixtures sync obligation)**: Cross-runtime contract changes sync runtime/bridge/tool-record/sandbox fixtures; persistence changes sync IndexedDB/local-storage/sync fixtures; external runtime changes sync DeepSeek route/SSE/MCP/Native/Shell fixtures; tolerated malformed behavior may only be marked `current-gap` + follow-up and must not be promoted to a legal fixture.
- **F (CI verification order)**: targeted tests → `compile` + static → `prompt:freeze` (when prompt/tool/inline-agent are involved) → affected builds (cross-browser `build:all`) → `verify:manifest-policy`/`verify:extension-utf8` → narrow smoke → wrap-up `ci:quality`; hard 60s timeout for unit tests; no broad catch/silent defaults/mock-success/log-free fallbacks; delete deprecated paths (single authority).

## Test Surface List (test points mountable in this run)

| Test surface | Representative file | Purpose in this run |
|:-------|:---------|:------------|
| inline-agent | inline-agent-loop.test.ts(417), prompt(252), execution-policy(55), renderer(297), chat-active-loop(103) | Dual-track comparison baseline; regression after replacement |
| tool-authorization | tool-authorization.test.ts(909), background-tool-authorization-integration(310) | Prove pi tool execution still goes through the grant (test anchor for risk f) |
| deepseek stream | deepseek-adapter-stream(356), active-protocol(162), protocol-contract(263), network-policy | Existing guarantees of the StreamFn reuse layer |
| interceptor | main-world-interceptor-controller, fetch-hook-request-lifecycle, request-augmentation(487), xml-tool-stream-filter(118), streaming-tool-call-parser(313) | Guarantee of unchanged page behavior |
| fixtures | tests/fixtures/{prompt-output, external-runtime, persistence-contract, runtime-contract} | Landing point of the contract sync obligation |
| **Gaps (to be created in this run)** | - | AGENT_* loop event protocol golden; StreamFn ↔ pi event stream mapping test; pi narrow-entry bundle tree-shake test |
