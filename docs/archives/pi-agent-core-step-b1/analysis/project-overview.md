# Project Overview — pi-agent-core Step B1: deepseek-web formal provider registration

> **Run**: spec:pi-agent-core-provider | **Mode**: GITHUB_STANDARD | **Base**: origin/main (c283e49, Step A archive merged)
> **Date**: 2026-08-05 | **Handoff**: step-b-handoff.md (Step A merged into main v1.12.2, browser testing found no issues)

## Goal

Upgrade the current "custom-StreamFn-only path" (`createDeepSeekStreamFn` in `core/inline-agent/pi/deepseek-stream-fn.ts` constructing the pi StreamFn directly) to a **formal pi-ai provider registration**: using the `Api = KnownApi | (string & {})` extension point, register the DS web backend as a pi-ai `Provider` (`createProvider` + `ProviderStreams`), making deepseek-web a first-class citizen of the pi-ai model registry and paving the way for B2 (multi-backend switching) and B3 (skills/agents ecosystem).

**Non-goals**: Do not change any production behavior (golden 10/10 holds); do not introduce new persistence; do not touch the main workspace; do not upgrade the pi version (still pinned at 0.83.0); do not introduce the OpenAI SDK dependency tree.

## Current State (Step A delivery, merged 2026-08-05)

- `core/inline-agent/pi/deepseek-stream-fn.ts`:
  - `createDeepSeekTurnSubmitter(options)` → `DeepSeekTurnSubmitter` (thin wrapper over `submitPromptStreaming`; PoW once per turn, retry only when no chunk, 120s step timeout).
  - `createDeepSeekStreamFn(deps)` → `StreamFn` (`(model, context, options) => AssistantMessageEventStream`), internally reusing `createClientHeaders`/`createPowHeaders`/`submitPromptStreaming` + the interceptor's tool-parser/streaming-tool-call-parser/streaming-tool-text.
- `core/inline-agent/pi/stream-fn-port.ts`: pure-type contract module (`DeepSeekStreamFnDeps`, etc.), no concrete implementation imports.
- `core/inline-agent/pi/loop-adapter.ts`: `runPiInlineAgentLoop` hand-builds a `Model<Api>` (`{ id: 'deepseek-chat', api: 'openai-completions', provider: 'deepseek' }`) + `pacedStreamFn` wrapper and passes it to `runAgentLoop`.
- Size guardrails: `scripts/pi-bundle-budget.mjs` (dual probes: pi bare surface 230K/72K, full-A3 430K/145K; node:/SDK leak gate; background red line raw≤820K/gzip≤240K).

## pi-ai 0.83.0 Provider System (fact-checked, measured in node_modules)

- `Api = KnownApi | (string & {})`: `KnownApi` is 10 known api strings; custom strings (such as `'deepseek-web'`) are legal, and when `ApiOptionsMap` has no entry it falls back to `StreamOptions & Record<string, unknown>`.
- `createProvider<TApi>(input: CreateProviderOptions<TApi>)` (`dist/models.js`):
  - `{ id, name?, baseUrl?, headers?, auth, models, fetchModels?, filterModels?, api }`; 
  - `api` can be a single `ProviderStreams` (`{ stream, streamSimple }`) or `Partial<Record<TApi, ProviderStreams>>` dispatched by `model.api`; with no entry it reports a stream error;
  - `Provider<TApi>` interface: `getModels()`, `stream(model, context, options)`, `streamSimple(...)`; `auth` is required (`ProviderAuth`, at least one of `apiKey`/`oauth`).
- `ProviderStreams` (`dist/types.d.ts`): `{ stream(model, context, options?) => AssistantMessageEventStream; streamSimple(...) }`.
- `AssistantMessageEventStream`: `EventStream<AssistantMessageEvent, AssistantMessage>`, factory `createAssistantMessageEventStream()` (already imported).
- Reference implementation: `providers/deepseek.js` = `createProvider({ id: 'deepseek', baseUrl: 'https://api.deepseek.com', auth: { apiKey: envApiKeyAuth(...) }, models: Object.values(DEEPSEEK_MODELS), api: openAICompletionsApi() })`. Note `openAICompletionsApi` is `lazyApi(() => import('./openai-completions.js'))` — the heavy SDK sits behind a dynamic import and does not enter the bundle via the static graph.

## B1 Design Decisions

1. **Custom api shape `'deepseek-web'`**: The DS web private format (SSE `{p,o,v}` patches, XML tool calls, PoW, no native function-calling) is not the OpenAI-compatible message format; pi-ai's existing `openai-completions` api `convertMessages`/`buildParams` assume the OpenAI message shape, and reusing it directly would violate "do not duplicate protocol logic". So a new api string is defined, outside `ApiOptionsMap` (falling back to `StreamOptions`), carried by our own `ProviderStreams` implementation.
2. **Thin-wrapper reuse**: `createDeepSeekWebProvider(deps)` internally reuses `createDeepSeekStreamFn` and `createDeepSeekTurnSubmitter` directly (same body; registration surface = `{ stream: streamFn, streamSimple: streamFn }`). It does **not duplicate** stream-codec/active-client protocol logic (AGENTS.md rule 3).
3. **auth shape**: `ProviderAuth` is required. deepseek-web's "authentication" is the page session headers (`createClientHeaders` reads userToken + x-client-* from localStorage), not an API key. It is expressed in the `apiKey.resolve()` form as "configured" (returning `{ auth: { headers } }`, with source marked `'DeepSeek Web session'`); with no token, resolve returns undefined (not configured) — consistent with pi-ai's "ambient credentials" semantics.
4. **Model catalog**: A static `Model<'deepseek-web'>` list (two ids, `deepseek-chat` / `deepseek-reasoner`, api='deepseek-web'), with `getModels()` returning synchronously. B1 does not connect a `createModels` collection; loop-adapter holds the provider object directly (smallest change surface).
5. **loop-adapter wiring**: `runPiInlineAgentLoop` changes to obtain `model` + `stream` from `createDeepSeekWebProvider(deps)`, replacing the hand-built `Model` + `pacedStreamFn`; the `pacedStreamFn` wrapper is kept (behavior unchanged). `model.api` changes from `'openai-completions'` to `'deepseek-web'` and `provider` from `'deepseek'` to `'deepseek-web'` — golden only asserts AGENT_* event payloads and does not include model metadata, so all-green is expected.
6. **streamSimple**: Same implementation as stream (the pi loop only uses stream; streamSimple is an interface requirement, mapped to the same function).
7. **Size**: `createProvider` depends on `dist/models.js` (auth/context, credential-store, resolve, models-store, api/lazy, event-stream). These modules are far smaller than the OpenAI SDK tree; the pi-bundle-budget increment must be measured and calibrated. Importing `openai-completions.js` (the OpenAI SDK) into the static graph is forbidden.

## Risk Carry-over (from Step A risk-assessment, B1 additions marked)

| # | Risk | Probability | Impact | Mitigation |
|:--|:-----|:----:|:----:|:-----|
| (b2) | Introducing the createProvider dependency surface inflates the bundle | Medium | High | Narrow entry importing only `createProvider`/`createModels` (if needed); measure probe increment; calibrate guardrail script; forbid dynamically importing heavy API modules into the static graph |
| (d2) | Prompt byte contract | Low | High | Provider does not consume pi templates; prompt serialization still goes through the `serializePrompt` injected by loop-adapter (existing `buildContinuationPrompt`/`buildNudgePrompt`); prompt:freeze zero diff must run |
| (g2) | Session-chain authority drift | Low | High | `DeepSeekSessionState` is still held and injected by loop-adapter; the provider holds no page state |
| (a2) | pi-ai version drift | Medium | Medium | Pin exactly to 0.83.0 and leave it; contract tests assert at compile time that `Provider<'deepseek-web'>` is assignable |
| (f2) | Authorization path | Low | High | Provider does not touch tool execution; tool-bridge unchanged |
| (e2) | DS web protocol change | Medium | Medium | stream still reuses active-client/stream-codec as the single authority |

## Acceptance Direction (per handoff document)

- `pi-bundle-budget` all green (including the new provider probe or the extended adapter probe);
- golden 10/10 (`tests/inline-agent-event-protocol-golden.test.ts`); 
- Existing StreamFn path behavior unchanged (`tests/stream-fn-adapter.test.ts`, `stream-fn-event-mapping.test.ts` all green);
- Provider registration contract tests (compile-time assignment assertions + registration shape + stream delegation consistency);
- `prompt:freeze` zero diff; `npm run compile` clean; browser builds pass.

## References

- `docs/archives/pi-agent-core-integration/` (Step A archive: MASTER.md / milestones.md / risk-assessment.md / task-breakdown.md)
- `AGENTS.md` (pi-agent-core integration: 5 stable rules)
- `step-b-handoff.md` (handoff document)
