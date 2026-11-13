# Risk Assessment — pi-agent-core Step B2: Official API Second Model Backend

## S.U.P.E.R Architecture Health (B2 perspective)

| Principle | Status | Findings (B2 change surface) | Priority |
|:----------|:-------|:---------------------|:---------|
| **S** Single Purpose | 🟢 | The new provider module has a single responsibility: registration surface + delegation, no protocol duplication | Low |
| **U** Unidirectional Flow | 🟢 | The provider only calls downward into official-api/network-policy; it does not hold authorization/page state in reverse | Low |
| **P** Ports over Implementation | 🟢 | Reuses the `DeepSeekAutomationClient` port shape and the stream-fn-port contract module | Low |
| **E** Environment-Agnostic | 🟡 | The size of the official API client entering the content bundle needs measurement (risk n5) | Medium |
| **R** Replaceable Parts | 🟢 | Golden contract guards the web path; the official API is a side-path addition | Low |

## Risk Matrix (B2 increment)

| # | Risk | Probability | Impact | Mitigation direction |
|:--|:-------|:----:|:----:|:---------|
| (n1) | Message mapping errors (pi Context → OfficialDeepSeekMessage[], reasoning_content/thinking) | Medium | High | Field-by-field mapping contract tests; reuse the existing official API stream mock; `createOfficialDeepSeekRequestBody` already has tests |
| (n2) | Chain integrity without parentMessageId (fail-closed semantics change) | Medium | High | In official API mode the chain authority = pi Context; validate that Context contains a valid assistant message before tool execution; dedicated fail-closed tests |
| (n3) | Unclear user-switching semantics | Medium | Medium | Consistent with chat (automatic switching based on whether an apiKey exists); no new UI; behavior documented in the Issue |
| (n4) | Prompt byte contract broken | Low | High | Serialization reuses buildContinuationPrompt/buildNudgePrompt output; prompt:freeze zero diff must run |
| (n5) | Bundle increment | Medium | Medium | Thin wrapper with no SDK (does not import the openai package); calibrate with a provider probe measurement; no node:/SDK leak gate |
| (n6) | Authorization provider identity extension | Medium | High | tool-bridge callSource (requestId/chatSessionId) unchanged; official API mode remains bound to the page session; tool-authorization regression |
| (n7) | Dual-backend regression (web path polluted by the official API branch) | Medium | High | golden 10/10 must run; zero change on the default web path; single authority for backend selection (payload field or apiKey check) |

## Invariants Checklist (B2 mapping)

- **A (inline-agent semantics)**: AGENT_* event protocol unchanged byte for byte (golden 10/10); abort/budget/truncation semantics untouched.
- **B (tool authorization red line)**: all tool execution still goes through the background grant; callSource is bound to requestId/chatSessionId; no second execution path.
- **C (prompt byte contract)**: prompt:freeze zero diff; serialization functions unchanged (output reused).
- **D (SSE/route contract)**: the official API contract is frozen (`submitOfficialDeepSeekStreaming` is the sole entry point, not duplicated); the web protocol still goes only through active-client/stream-codec.
- **E (fixtures sync)**: no cross-runtime contract change (AGENT_* payloads unchanged) → no fixtures diff; stop and investigate immediately on any unexpected diff.
- **F (verification order)**: targeted tests → compile → prompt:freeze → build:all → verify:* → narrow smoke → ci:quality.

## Test Surface Mounting

| Test surface | Representative file | B2 purpose |
|:-------|:---------|:--------|
| Official API provider (new) | `tests/deepseek-api-provider.test.ts` | Registration shape + message mapping + reasoning pass-through + stream delegation + auth (apiKey) |
| Message mapping (new) | Same as above or `tests/pi-official-api-mapping.test.ts` | pi Context ↔ OfficialDeepSeekMessage field by field |
| Event protocol golden | `tests/inline-agent-event-protocol-golden.test.ts` | Default web path 10/10 regression |
| Existing official API surface | `tests/deepseek-official-api.test.ts`(143) | Underlying contract untouched (consume only) |
| Tool authorization | `tests/pi-tool-bridge-authorization.test.ts` | Tool execution in official API mode still goes through the grant |
| Size guardrails | `scripts/pi-bundle-budget.mjs` | deepseek-api provider probe increment calibration |
