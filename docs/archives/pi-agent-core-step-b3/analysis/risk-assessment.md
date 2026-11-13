# Risk Assessment — pi-agent-core Step B3: Import of the pi skills/agents ecosystem

## S.U.P.E.R Architecture Health (B3 perspective)

| Principle | Status | Findings (B3 change surface) | Priority |
|:----------|:-------|:---------------------|:---------|
| **S** Single Purpose | 🟢 | pi-importer has a single responsibility: SKILL.md parsing + bridging to the existing import pipeline | Low |
| **U** Unidirectional Flow | 🟢 | Skill content flows one way: file → parse → existing storage → existing augmentation pipeline | Low |
| **P** Ports over Implementation | 🟢 | Reuses the `core/skill` record model and the local-importer port; pi-importer has zero pi dependencies | Low |
| **E** Environment-Agnostic | 🟢 | Pure parser (no FileSystem/Shell ExecutionEnv); runs in both browser and Node | Low |
| **R** Replaceable Parts | 🟢 | The format bridge is replaceable (swapping the parser does not affect storage/injection) | Low |

## Risk Matrix (B3 increment)

| # | Risk | Probability | Impact | Mitigation direction |
|:--|:-------|:----:|:----:|:---------|
| (p1) | Dual-track memory/session (pi session/memory persisted) | Low | High | pi context is only working memory (existing rule); skills enter only the existing Skill storage; no new persistence keys (guarded by pi-storage-boundary) |
| (p2) | Prompt byte contract broken (pi system-prompt templates enter the wire) | Low | High | Do not consume `formatSkillsForSystemPrompt`/`formatSkillInvocation` (grep asserts zero references); prompt:freeze zero diff must run |
| (p3) | Import format compatibility (frontmatter variants/encoding/nesting/unknown fields) | Medium | Medium | Parser contract tests (valid/malformed/unknown fields); malformed behavior marked `current-gap` and not promoted to a legal fixture |
| (p4) | Size (importing the pi harness drags in FileSystem/Shell dependencies) | Medium | Medium | pi-importer has zero pi dependencies (pure parsing, does not import @earendil-works/*); guardrail probe measurement + sdkMarkers gate |
| (p5) | Community skill content safety (instruction injection/malicious frontmatter) | Medium | High | Same trust surface as existing local skills (explicit user import); only injected into the prompt, never auto-executed; reuses existing authorization/sanitization paths |
| (p6) | Conflict with the existing skill registry (same name/duplicate import) | Medium | Medium | Reuse local-importer's existing dedup/overwrite semantics; contract tests |

## Invariants Checklist (B3 mapping)

- **A (inline-agent semantics)**: AGENT_* event protocol unchanged byte for byte (golden 10/10).
- **B (tool authorization red line)**: Skill import does not touch tool execution; unchanged.
- **C (prompt byte contract)**: prompt:freeze zero diff; skills are injected through the existing augmentation pipeline; zero pi template references.
- **D (SSE/route contract)**: Not touched.
- **E (fixtures sync)**: No cross-runtime contract change; malformed parsing behavior is only marked `current-gap`.
- **F (verification order)**: targeted tests → compile → prompt:freeze → build:all → verify:* → narrow smoke → ci:quality.
- **Constraint 2**: No new persistence keys (pi-storage-boundary stays all green).

## Test Surface Mounting

| Test surface | Representative file | B3 purpose |
|:-------|:---------|:--------|
| SKILL.md parsing (new) | `tests/pi-skill-importer.test.ts` | frontmatter/body/recursion/malformed/unknown-field contract |
| Bridge persistence (new) | Same as above or `tests/pi-skill-importer.test.ts` | parse → existing record shape → local-importer path |
| Storage boundary | `tests/pi-storage-boundary.test.ts` | Guard against new persistence keys (stays green) |
| Event protocol golden | `tests/inline-agent-event-protocol-golden.test.ts` | 10/10 regression |
| Size guardrails | `scripts/pi-bundle-budget.mjs` | pi-importer probe (no pi harness leak) |
