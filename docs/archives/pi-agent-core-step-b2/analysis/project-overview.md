# Project Overview — pi-agent-core Step B2: Official API Second Model Backend

> **Run**: spec:pi-agent-core-official-api | **Mode**: GITHUB_STANDARD | **Base**: origin/main (7d2e52a, B1 governance merged)
> **Date**: 2026-08-05 | **Prerequisite**: B1 complete (deepseek-web registered as a formal pi-ai provider)

## Goal

Connect a second model backend to the same pi loop: the **official DeepSeek API** (`submitOfficialDeepSeekStreaming` in `core/deepseek/official-api.ts`, OpenAI-compatible + reasoning_content), user-switchable (after configuring an API key it automatically uses the official API, consistent with the chat `runChatTurn` pattern `apiKey ? 'official-api' : 'web'`).

**Non-goals**: Do not change web backend behavior (the B1 delivery stays); do not change the prompt byte contract (buildContinuationPrompt/buildNudgePrompt output reused as-is); do not introduce the OpenAI SDK dependency tree (thin wrapper over the existing `submitOfficialDeepSeekStreaming`); do not add persistence keys (the API key/chat config already exist as `deepseek_pp_official_api_key` / `deepseek_pp_official_api_chat_config`).

## Current State (after B1)

- `core/inline-agent/pi/deepseek-web-provider.ts`: `createDeepSeekWebProvider(deps)` → `Provider<'deepseek-web'>`, the loop consumes via `provider.stream` (B1).
- `core/inline-agent/pi/stream-fn-port.ts`: `DeepSeekStreamFnDeps` (submitTurn/session/serializePrompt/mapToolCall/toolDescriptors/turnDefaults/onTokenSpeed).
- `core/deepseek/official-api.ts`: `submitOfficialDeepSeekStreaming(input, callbacks, signal)` — OpenAI-compatible messages array (role/content/reasoningContent) + SSE stream; no page session chain (no parentMessageId concept).
- `core/chat/api-key.ts`: `getDeepSeekApiKey()`/`saveDeepSeekApiKey()` (storage key `deepseek_pp_official_api_key`).
- `core/chat/official-api-config.ts`: `getOfficialApiChatConfig()` (model/thinking/reasoningEffort).
- `entrypoints/background/chat-runtime-service.ts`: chat already has an official API tool loop (`runOfficialToolLoop`) — the same XML tool protocol (`extractToolCalls`) + `serializeToolExecutions` + `continueWithToolResults` (i18n `background.chat.continueWithToolResults`).

## Key B2 Design Differences (Web vs Official API)

| Dimension | deepseek-web (B1) | deepseek-api (B2 new) |
|:-----|:-------------------|:------------------------|
| Protocol | DS web SSE `{p,o,v}` patch + PoW + page session chain | OpenAI-compatible SSE (choices/delta/reasoning_content), no page session chain |
| Message format | Single prompt string (serializePrompt serializes the Context) | messages array (role/content/reasoningContent), naturally close to pi Context |
| Session chain authority | `DeepSeekSessionState.parentMessageId` (page chain, prevents forks) | No parentMessageId; each messages array is self-contained (pi Context is the chain) |
| Tool calls | XML text stream parsing (existing) | Same XML protocol (model outputs XML text, parsed by `extractToolCalls`) — consistent with the chat official API loop |
| Authentication | Page headers (createClientHeaders) | `Authorization: Bearer <apiKey>` (storage config) |
| Model | deepseek-chat / deepseek-reasoner (web) | Official config model (deepseek-v4-flash / deepseek-v4-pro) + thinking/reasoningEffort |
| User switching | None (default) | Automatically switches to the official API after configuring an API key (consistent with chat); falls back to web without a key |

## B2 Design Decisions

1. **New provider `deepseek-api`**: `createDeepSeekApiProvider(deps)` → `Provider<'deepseek-api'>`, a thin wrapper over `submitOfficialDeepSeekStreaming` (no protocol logic duplication, AGENTS.md StreamFn rule); extension point `Api = KnownApi | (string & {})`, api id `'deepseek-api'`.
2. **StreamFn port extension**: `DeepSeekStreamFnDeps` gains an optional official API branch, or a new `DeepSeekApiStreamFnDeps` is added (messages passed straight through + reasoning callback); the contract module stays pure types.
3. **loop-adapter backend selection**: `runPiInlineAgentLoop` gains backend selection (the payload adds `modelBackend?: 'web' | 'official-api'`, or auto-select based on whether an API key exists — consistent with chat, no new UI needed on the user side); defaults to web, keeping behavior unchanged.
4. **Session chain adaptation**: In official API mode `session.parentMessageId` is always null and unusable — a new chain authority is needed: the pi Context message array (tool results returned as user messages, consistent with `runOfficialToolLoop`); the fail-closed semantics are adjusted to the official API equivalent of "reject tools when there is no chain" (there is no responseMessageId concept, so it becomes a Context message integrity check).
5. **Prompt byte contract**: Serialization still reuses the `buildContinuationPrompt`/`buildNudgePrompt` output (as user message content); `prompt:freeze` must run with zero diff.
6. **Size**: Add a new provider probe (deepseek-api) to measure the increment; `submitOfficialDeepSeekStreaming` is already used in background (chat), and the content-side increment must be measured.

## Risk Carry-over (B2 increment)

| # | Risk | Probability | Impact | Mitigation |
|:--|:-----|:----:|:----:|:-----|
| (n1) | Official API message format mapped incorrectly to pi Context (reasoning_content/thinking) | Medium | High | Mapping contract tests (pi Message[] → OfficialDeepSeekMessage[] field by field); official API stream tests reuse the existing mock |
| (n2) | Session chain authority drift (chain integrity without parentMessageId) | Medium | High | In official API mode the chain authority = pi Context; validate that Context contains a valid assistant message before tool execution; fail-closed tests |
| (n3) | Unclear user-switching semantics (automatic vs manual) | Medium | Medium | Consistent with chat `apiKey ? 'official-api' : 'web'` (automatic); no new UI; behavior documented |
| (n4) | Prompt byte contract broken | Low | High | Serialization reuses existing output; prompt:freeze zero diff must run |
| (n5) | Bundle increment (official API client entering content) | Medium | Medium | Thin wrapper with no SDK; calibrate with a provider probe measurement |
| (n6) | Authorization provider identity extension (tool authorization subject in official-api mode) | Medium | High | tool-bridge callSource unchanged (requestId/chatSessionId still present); authorization test regression |

## Acceptance Direction

- golden 10/10 holds (zero change on the default web path);
- Official API backend targeted tests all green (message mapping, reasoning, tool loop, fail-closed, abort);
- `prompt:freeze` zero diff; `pi-bundle-budget` all green (including the deepseek-api provider probe);
- User switching semantics consistent with chat (configuring an API key uses the official API; without a key it falls back to web);
- One independent Issue authorization per new backend (this run = the single official API one).

## References

- `docs/archives/pi-agent-core-step-b1/` (B1 archive: MASTER.md / project-overview / risk-assessment / task-breakdown)
- `docs/archives/pi-agent-core-integration/` (Step A archive)
- `AGENTS.md` (stable pi-agent-core integration rules; B1 added provider rules)
- `step-b-handoff.md` (handoff document)
