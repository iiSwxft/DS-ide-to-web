# Milestones — pi-agent-core Step B1

| # | Milestone | Target | Criteria | Status |
|:--|:----------|:-------|:---------|:-------|
| 1 | **M-B1 · deepseek-web formal provider registration complete** | After P3-B1 merged | ① `pi-bundle-budget` all green (including provider probe) ② golden 10/10 ③ existing StreamFn path tests all green ④ provider registration contract tests green ⑤ prompt:freeze zero diff ⑥ B2 start conditions recorded | Pending |

## Step B Follow-ups (recorded, no Milestone/Issue created, each item a separate run)

| # | Roadmap Item | Start condition | Notes (risk carry-over) |
|:--|:-------------|:---------|:-----------------|
| B2 | Multi-backend support (second model backend such as the official API) | B1 complete | Reuse the `DeepSeekAutomationClient` port; each new backend needs its own Issue authorization (invariant D); message-format differences (reasoning_content/thinking), authorization provider identity extension, prompt byte-contract assessment |
| B3 | Import of the pi skills/agents ecosystem | B2 complete | Dual-track memory (pi's own memory vs IndexedDB — a single authority must be kept), prompt byte contract (pi templates must not enter the wire); each change needs its own Issue authorization |
