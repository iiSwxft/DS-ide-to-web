# Milestones — pi-agent-core Step B2

| # | Milestone | Target | Criteria | Status |
|:--|:----------|:-------|:---------|:-------|
| 1 | **M-B2 · Official API second model backend integration complete** | After P3-B2 merged | ① golden 10/10 (zero change on the web path) ② official API provider contract tests green ③ single authority for dual-backend selection ④ prompt:freeze zero diff ⑤ guardrails all green ⑥ user switching semantics consistent with chat ⑦ B3 start conditions recorded | Pending |

## Step B Follow-ups (recorded, no Milestone/Issue created, each item a separate run)

| # | Roadmap Item | Start condition | Notes (risk carry-over) |
|:--|:-------------|:---------|:-----------------|
| B3 | Import of the pi skills/agents ecosystem | B2 complete | Dual-track memory (pi's own memory vs IndexedDB — a single authority must be kept), prompt byte contract (pi templates must not enter the wire); each change needs its own Issue authorization |
