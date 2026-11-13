# Risk Assessment — pi-agent-core Step B1: deepseek-web provider registration

## S.U.P.E.R Architecture Health (B1 perspective)

| Principle | Status | Findings (B1 change surface) | Priority |
|:----------|:-------|:---------------------|:---------|
| **S** Single Purpose | 🟢 | The new provider module has a single responsibility: registration surface + delegation, no protocol duplication | Low |
| **U** Unidirectional Flow | 🟢 | The provider only calls downward into stream/active-client; it does not hold authorization/page state in reverse (the session chain remains in loop-adapter) | Low |
| **P** Ports over Implementation | 🟢 | Reuses the `stream-fn-port.ts` contract module; provider port types are serializable | Low |
| **E** Environment-Agnostic | 🟡 | The `createProvider` dependency surface (models.js → auth/models-store/event-stream) needs bundle measurement (risk b2) | High |
| **R** Replaceable Parts | 🟢 | Guarded by golden contract tests; the provider registration is swappable for any pi-ai provider | Low |

## Risk Matrix (B1 increment)

| # | Risk | Probability | Impact | Mitigation direction |
|:--|:-------|:----:|:----:|:---------|
| (b2) | `createProvider`/`models.js` dependency surface inflates the content bundle | Medium | High | Import only the single `createProvider` symbol; measure probe increment and calibrate guardrails; keep heavy API modules such as `openai-completions`/`openai-responses` out of the static graph (lazy gate) |
| (d2) | Provider layer misuses pi prompt templates or changes serialization | Low | High | Serialization is still injected by loop-adapter; provider has no template references (grep assertion); prompt:freeze zero diff |
| (g2) | Provider holding session-chain state causes a fork | Low | High | `DeepSeekSessionState` stays owned by loop-adapter; injected at provider construction, no new state created |
| (a2) | pi-ai upstream type drift | Medium | Medium | Pin exactly to 0.83.0; compile-time assignment assertions in `tests/deepseek-web-provider.test.ts` |
| (f2) | Authorization path bypassed | Low | High | Provider does not touch tools; tool-bridge unchanged; golden full tool-record payload regression |
| (m2) | Changing the model.api identifier ('openai-completions'→'deepseek-web') affects pi internal logic | Low | Medium | Checked agent-loop.js: `model.api` is only passed through to AssistantMessage/streamFn, with no api branching; golden does not test model metadata; all-green regression proves it |

## Invariants Checklist (B1 mapping)

- **A (inline-agent semantics)**: AGENT_* event protocol unchanged byte for byte (golden 10/10); abort/budget/truncation semantics untouched.
- **B (tool authorization red line)**: zero tool logic in the provider layer; execution path unchanged.
- **C (prompt byte contract)**: prompt:freeze zero diff; serialization functions unchanged.
- **D (SSE/route contract)**: stream still reuses active-client/stream-codec; protocol is not duplicated.
- **E (fixtures sync)**: no cross-runtime contract change (AGENT_* payloads unchanged) → no fixtures diff; stop and investigate immediately on any unexpected diff.
- **F (verification order)**: targeted tests → compile → prompt:freeze → build:all → verify:* → narrow smoke → ci:quality.

## Test Surface Mounting

| Test surface | Representative file | B1 purpose |
|:-------|:---------|:--------|
| Provider registration contract (new) | `tests/deepseek-web-provider.test.ts` | Compile-time assignment assertions + registration shape + stream/streamSimple delegation consistency + auth resolve |
| Event protocol golden | `tests/inline-agent-event-protocol-golden.test.ts` | Byte-for-byte regression of 10 scenarios (must run after wiring) |
| StreamFn adapter | `tests/stream-fn-adapter.test.ts`, `stream-fn-event-mapping.test.ts` | Existing path behavior unchanged |
| Size guardrails | `scripts/pi-bundle-budget.mjs` | Provider probe increment calibration |
