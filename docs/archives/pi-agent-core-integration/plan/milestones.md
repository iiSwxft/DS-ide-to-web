# Milestones — pi-agent-core Integration Step A

| # | Milestone | Target Phase | Criteria | Status |
|:--|:----------|:-------------|:---------|:-------|
| 1 | **M1 · Contracts and foundation ready** | After Phase 1 (P1-B1 merged) | ① golden contract tests all green with zero production code changes ② pi-agent-core pinned exactly at 0.83.0 (lockfile consistent) ③ narrow-entry bundle measurement within the size red line ④ `pi-bundle-budget` guardrail script effective | Pending |
| 2 | **M2 · Step A complete (pi loop replacement live)** | After Phase 5 (P5-B1 merged) | ① all 21 segments of `ci:quality` green ② old self-built loop body deleted (single authority) ③ `prompt:freeze` zero diff (prompt bytes unchanged) ④ AGENT_* event sequence byte-for-byte identical to golden ⑤ size guardrails effective ⑥ docs/compatibility registry + AGENTS.md synced ⑦ archive checklist ready (Phase 6) | Pending |

## Step B Roadmap (recorded, no Milestone/Issue created)

| # | Roadmap Item | Content | Start condition | Notes (risk carry-over) |
|:--|:-------------|:-----|:---------|:-----------------|
| B1 | pi-ai provider registration | Register the deepseek-web model backend as a formal pi-ai provider (moving away from the custom-StreamFn-only path) | Separate run after the Step A archive | Depends on the A1 port being stable; watch the multi-provider registry and the expansion of the authorization provider/mode/risk surface |
| B2 | Multi-backend support | Connect second model backends such as the official API / automation port to the same loop | After B1 | Reuse the `DeepSeekAutomationClient` port; each new backend needs Issue authorization (invariant D) |
| B3 | pi skills/agents ecosystem import | Reuse pi's agents/skills configuration ecosystem | After B2 | Risk carry-over: dual-track memory (h), prompt byte contract (d) — each change needs a separate Issue authorization + prompt:freeze |
