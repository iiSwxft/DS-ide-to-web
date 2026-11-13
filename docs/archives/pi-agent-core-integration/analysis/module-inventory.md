# Module Inventory — pi-agent-core Integration

> Scope: modules directly related to "inline agent loop replacement + StreamFn adaptation". For the full project analysis see `docs/archives/deepseek-pp-reliability-compatibility-refactor/analysis/module-inventory.md`.

## Overview Table

| Module | Responsibility | Files | Lines | S.U.P.E.R |
|:-------|:---------------|------:|------:|:----------|
| inline-agent | Self-built agent loop + execution policy + rendering + trace | 9 | ~2003 | S🟡 U🟡 P🟢 E🟡 R🟡 |
| tool-loop/engine | Generic tool execution/continuation loop (injection-based decoupling) | 1 | 114 | S🟢 U🟢 P🟢 E🟢 R🟢 |
| deepseek | DS web session client (auth/PoW/SSE/codec) + official API | 10 | ~2223 | S🟢 U🟢 P🟢 E🟢 R🟢 |
| interceptor | Transparent page interception + prompt augmentation + tool call parsing/stripping | 7 | ~3442 | S🟡 U🟡 P🟢 E🟡 R🟢 |
| tool (invocation surface) | Tool description/call modeling, XML parsing, authorization type family | 4 | ~751 | S🟢 U🟢 P🟢 E🟢 R🟢 |
| pi-agent-core (target to introduce) | External agent loop engine (npm 0.83.0, MIT) | - | 271K dist | S🟡 (multi-purpose monolith, narrow entry needed) |

## Module Details

### core/inline-agent/ (replacement target)
- **Responsibility**: Self-built agent loop — drives the DS web interface in a loop with continuation prompts (streaming request → tool call parsing → sequential execution → rendering/trace).
- **Public API**: `runInlineAgentLoop(payload: InlineAgentStartPayload, deps: {post, executeTool, signal})`; prompt.ts (`buildContinuationPrompt`/`buildNudgePrompt`/`extractTaskCompleteSignal`/`shouldNudge`); execution-policy.ts (`selectContinuableToolExecutions`); renderer.ts; markdown.ts; auto-save.ts; trace-codec/trace-store (key `dpp_inline_agent_traces`, TTL 30 days); types.ts (7 `AGENT_*` message types + budget constants).
- **Key contracts**: The only interaction with the model backend is `submitPromptStreaming(input, {retainAssistantText, onTextChunk, onTokenSpeed}, signal) → ModelTurn{assistantText, responseMessageId, requestMessageId, finished}`; tool calls = plain-text stream XML `<invocationName>{JSON}</invocationName>`; session chain safety: `responseMessageId === null && toolCalls.length > 0` refuses execution; the continuation prompt is a page/history-visible wire contract (`<original_task>`/`<tool_results>`/`<task_complete>`/placeholder `⁣⁤⁣`).
- **Transformation Notes**: loop.ts is directly coupled to adapter at function level (`submitPromptStreaming/createClientHeaders/createPowHeaders`), not going through the `DeepSeekAutomationClient` port — the seam must be made explicit during replacement. R=3 is the bullseye of this transformation.
- **S.U.P.E.R**: S🟡 (loop+prompt+policy+render+trace in one module) U🟡 (events rely on implicit callbacks) P🟢 (message shapes already typed) E🟡 (content-context assumptions) R🟡 (no event protocol contract tests).

### core/tool-loop/engine.ts (kept and reused)
- **Responsibility**: Generic tool execution/continuation loop, shared by automation and the inline agent.
- **Public API**: `executeToolCallsSequentially(calls, executeTool, {signal})`; `runToolContinuationLoop<TTurn>(input)`; `createToolExecutionRecord`.
- **Key contracts**: The executor is fully decoupled from "who executes and how it is authorized"; `ToolLoopExecuteTool = (call) => Promise<ToolExecutionRecord>` is the sole external dependency surface.
- **Transformation Notes**: pi's AgentTool execution should map to this injection surface (behind which is background authorization).

### core/deepseek/ (model backend source of truth, reused)
- **Responsibility**: DS web session client + official API.
- **Public API**: the `DeepSeekAutomationClient` port in `automation-client-port.ts` (**the ready-made definition of the model backend seam**); `active-client.ts` (`createClientHeaders`/`createChatSession`/`createPowHeaders`/`submitPrompt`/`submitPromptStreaming`/`readHistorySnapshot`/`uploadDeepSeekFile`); `request-codec.ts` (`encodeCompletionRequest`/`normalizeDeepSeekMessageId` strict u32 validation); `stream-codec.ts` (byte→frame→event→parsed layered decoding, `consumeDeepSeekSseEvents`, `extractResponseTextFromParsed` with 4 patch formats, `isStreamFinishedFromParsed`); `pow.ts`; `official-api.ts`.
- **Key contracts**: Request body `{chat_session_id, parent_message_id, model_type, prompt, ref_file_ids, thinking_enabled, search_enabled, ...}`; auth Bearer + `X-DS-PoW-Response` + `x-client-*`; stream events `{p,o,v}` JSON patches; no native function-calling (tool calls are entirely in text); `fetchWithNetworkPolicy` unifies network policy (deadline/4MiB).
- **Transformation Notes**: P=5. The StreamFn adapter should use `DeepSeekAutomationClient`/`ModelTurn` as its boundary, a thin wrapper that does not duplicate protocol logic.

### core/interceptor/ (page behavior layer, kept)
- **Responsibility**: Transparent page interception (fetch/XHR/IDB), prompt augmentation, streaming tool call parsing, SSE tool block stripping, history sanitization.
- **Public API**: `installFetchHook`/`HookState` callback registry (onRequestBody/onHeadersCaptured/onToolCall*/onResponseComplete/onRequestTerminal/onMemoriesUsed); `augmentRequestBody`; `extractToolCalls`/`stripToolCalls`; `createStreamingToolCallParser`; `createStreamingToolTextAccumulator`; `stripToolCallsFromHistory`.
- **Key contracts**: Internal requests carry the `X-DPP-Bypass-Hook` header; `isInlineAgentContinuationRequest` suppresses page events (deeply coupled with inline-agent/prompt.ts); SSE frame-level `XmlToolStreamFilter` strips tool blocks.
- **Transformation Notes**: The lowest-scoring module at S=3.4 (fetch-hook.ts, 1461 lines with many responsibilities); but not a transformation target of this run — **consume only, do not modify** its behavior contracts.

### core/tool/ (authorization boundary, kept)
- **Responsibility**: Tool description/call modeling, XML/DSML dual-protocol parsing, provider registration/execution/authorization type family.
- **Public API**: `createToolInvocationCatalog`/`createToolCallFromInvocation`; `ToolCall`/`ToolDescriptor`/`ToolAuthorizationSubject`/`ToolAuthorizationGrantSummary`/`ToolCapabilityScope`/`ToolGrantExecutionContext`.
- **Key contracts**: Wire protocol `<name>{JSON}</name>` or `｜DSML｜`; all production execution must go through the runtime authorization path (either grant or trusted); `ToolCall.source` is only a routing declaration, not authorization evidence.
- **Transformation Notes**: The anchor for invariants B1-B4. The pi loop may only call downward through the existing `executeTool(call, grantId)` port.

### @earendil-works/pi-agent-core@0.83.0 (target to introduce, npm verified)
- **Facts**: version 0.83.0; MIT; exports `.` → dist/index.js (environment-agnostic), `./node` → dist/node.js (Node-only, unavailable in content); deps: `@earendil-works/pi-ai ^0.83.0`, `diff 8.0.4`, `ignore 7.0.5`, `typebox 1.3.7`, `yaml 2.9.0` (all pure JS); dist has no `node:` built-in imports; engines node≥22.19.
- **Key seams**: `agentLoop(prompts, context, config, signal, streamFn) → EventStream<AgentEvent, AgentMessage[]>`; `StreamFn = (model, context, options) => AssistantMessageEventStream` (fully customizable); hooks (BeforeToolCall/AfterToolCall/PrepareNextTurn/ShouldStopAfterTurn); compaction/branch-summary; `QueueMode` (sequential/parallel); `runAgentLoopContinue` (retry).
- **Transformation Notes**: The `.` entry does `export *` of all submodules (including harness/session/compaction/tools); a wide import would drag in pi-ai's AWS/Anthropic/Google/Mistral SDK dependency trees — a narrow-entry import + tree-shake measurement is required.

## Coupling Hotspot List (planning input for this run)

1. **loop.ts ↔ active-client.ts function-level coupling (highest priority)**: `runInlineAgentLoop` imports adapter functions directly; the StreamFn should take `DeepSeekAutomationClient`/`ModelTurn` as the adapter boundary.
2. **Continuation prompt wire contract (the largest implicit contract)**: `<original_task>`/`<tool_results>`/`<task_complete>`/placeholders are shared by fetch-hook (event suppression), history-cleanup (sanitization), and loop (continuation); after switching engines, the recognition/sanitization logic must be retained or upgraded in sync, otherwise page history leaks internal prompts.
3. **Tool call protocol shape**: ToolCall and the `｜DSML｜` legacy are everywhere across interceptor/tool-parser/history-cleanup/authorization restoration; pi's own tool-call encoding needs bidirectional mapping, and the streaming incremental/dedup/oversized-body externalization semantics of `streaming-tool-call-parser` must not be lost.
4. **The authorization path must be preserved as is**: The pi loop replaces only the "caller"; the `core/tool/runtime + authorization` trust boundary cannot be bypassed.
5. **SSE shape sharing**: The SSE shape consumed by the StreamFn must share the sole source of truth `stream-codec.ts` with the interceptor's `XmlToolStreamFilter`.
6. **AGENT_* event protocol**: The 7 message shapes are protected bridge records; pi's AgentEvent must be translated into this protocol or the protocol upgraded (involving MAIN/content bridge contract changes, requiring registry sync).
7. **Budget/throttling**: MAX_STEPS/NUDGES/delay/timeout + the `INLINE_AGENT_FULL_TOOL_RESULT_WINDOW=4` window compression must be mapped to pi's step control and context management.
8. **Session chain safety check**: `responseMessageId === null && toolCalls.length > 0` refuses execution — the fork-prevention defense must be carried by the adapter layer.
9. **Execution record shape**: `ToolExecutionRecord` is shared by prompt rendering/trace codec/auto-save/history — pi tool results must be normalized to this shape.
