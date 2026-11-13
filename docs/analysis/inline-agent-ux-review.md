# Inline Agent Run Panel UI/UX Review Report

- Date: 2026-08-05
- Scope: The panel UI/UX that DeepSeek++ injects into the DeepSeek web app (chat.deepseek.com) when running in Agent mode
- Method: 3 independent subagents reviewed in parallel — (1) a code-level UI/UX audit of the current state; (2) design-language research on 8 categories of competitors such as Claude Code Desktop; (3) a three-way comparison of our own sidepanel design system + the DeepSeek page's visual conventions. Key claims were all re-verified in the code.
- Status: **Fully completed and accepted**. The P0 batch was merged (PR [#542](https://github.com/zhu1090093659/deepseek-pp/pull/542), Issue #541 closed); the P1 batch was merged (PR [#545](https://github.com/zhu1090093659/deepseek-pp/pull/545), Issue #544 closed). Manual browser smoke: the user loaded the extension from a local build (dist/chrome-mv3) in ego-lite and tested it in expert mode on chat.deepseek.com, visually confirming no issues.

## 1. Current Architecture

| File | Responsibility |
| --- | --- |
| `core/inline-agent/renderer.ts` | Injected styles + all DOM construction (step cards, tool entries, result details, footer, top-right running indicator) |
| `core/ui/injected-theme.ts` | The `--dpp-ui-*` CSS variables for injected UI (oklch palette, from the same source as the sidepanel `--ds-*`) |
| `core/inline-agent/markdown.ts` | Streaming markdown rendering (XSS escaping + protocol allowlist) |
| `entrypoints/content.ts` | Lifecycle: start/mount/event handling (stream, step complete, loop complete/error), trace restoration after refresh |
| `core/inline-agent/step-control.ts` | Step timeout (120s) and request throttling (2.5-6.5s random delay) |
| `core/i18n/resources/zh-CN/content.ts` | Agent copy (lines 91-110) |

## 2. Overall Assessment

The foundation is not bad: the oklch cool-blue dual theme, dual-channel status encoding (border color + dot), rAF throttling, and render-after-refresh recovery were all deliberately done. The problems concentrate on three P0-level "status lies / interaction hijacking" issues, plus extension-feel details such as 9-11px small fonts + unicode icons. The gap with Claude Code Desktop lies in **information density management with collapsed-by-default** and **restrained, low-frequency status feedback with numbers**.

## 3. P0 Findings (must fix)

1. **Status lies during tool execution**: `AGENT_TOOL_DETECTED` is an empty branch at `content.ts:3846-3847`, and the ⚙ style for `executing_tools` (`renderer.ts:71-77,134-137`) is dead code in the live flow, visible only on refresh recovery. While tools are running the panel still shows a blinking ● "streaming...".
2. **Streaming refresh hijacks scrolling**: every chunk fully re-renders `body.innerHTML` (`renderer.ts:591-592`) + unconditionally scrolls to the bottom (`:596-603`). Users who scroll up get dragged back and selections are destroyed; long steps stall from full regex re-parsing every frame.
3. **Stopped/budget-exhausted wrapped as "done"**: Stop goes through `isError=false` → green ■ + "Stopped" (`content.ts:3730`); when the budget is exhausted the copy says "Paused" but the footer still shows green "Agent complete" (`renderer.ts:430-433`).

## 4. P1 Findings

### Visual
- Unicode characters used as icons: ●⚙✓✗▼▸■ (`renderer.ts:127,135,139,143,375-380,411,431-436,533,653`); on macOS ⚙ renders as an emoji, jagged across platforms. → Inline SVG.
- Font sizes are one step smaller than the host overall: 9px chevron (`:163,343`), 10px dot (`:123`), 11px buttons/labels (`:173,189,338`). → Start at 12px, body at 14px.
- Insufficient contrast: `--dpp-ui-text-subtle` oklch(0.70) is about 2.4:1 on a white background (`injected-theme.ts:19,42`).
- Mixed 4/5/6px corner radii (`renderer.ts:49,94,364,175`), header 5px vs step 6px causes jagged top-right corners; `--dpp-ui-shadow/panel-shadow` are defined but not consumed (`injected-theme.ts:32-33`), `renderer.ts:408` hardcodes an rgba shadow; `--dpp-ui-danger` == `--dpp-ui-error` (`:27,31`).

### Interaction
- The top-right fixed indicator with z-index 2147483647 (`renderer.ts:393-408`) covers DeepSeek's top-bar controls, has no role/aria-live, and rewrites its text on every chunk.
- A 2.5-6.5s random delay between mounting and the first step (`step-control.ts:50-52`) has no "starting" feedback; missing authorization (`content.ts:3571`) / host not found (`:3608`) silently return.
- Steps unconditionally auto-collapse 800ms after completion (`content.ts:3952-3954`), overriding the user's manual expansion.
- The footer "Agent complete (N steps, M tool calls)" is sandwiched between the steps and the final answer (`content.ts:3969-3972,4012-4023`); the "tool calls" label (`content.ts:482`) is defined but never rendered.

### Accessibility and Robustness
- Zero aria-live across the entire panel.
- A streaming step restored after refresh keeps a permanently pulsing ● "streaming..." with no stop button (`content.ts:6283,6290`).
- Inconsistent truncation: tool summaries are silently truncated at 600 characters (`renderer.ts:6,664`), while details have a `[truncated]` marker (`:745-751`).
- The collapse transition is not covered by reduced-motion (`:208,282`); `aria-controls` declares only the body (`:516`), and the tools/results hidden by collapsing are not declared; markdown lists generate bare `<li>` (`markdown.ts:25-26`).

### Design System (three-way comparison)
- The palettes naturally share a source: sidepanel `--ds-blue` #4D6BFE ≈ DeepSeek focus ring #4d6bfe, the same cool-toned oklch 264, the same "1px border + inset highlight" philosophy. **No need to change tokens**.
- The divergence is in corner radius and font size: the DeepSeek page uses 8/10/12/16px radii and 16px body text; the sidepanel is editorial with 0px cards + 6px controls; the injected family itself is split (tool-card 12px vs inline agent 6px vs skill 8px).
- **Dark mode is out of sync (the biggest integration gap)**: DeepSeek switches theme with `body[data-ds-dark-theme]`, while the injected family relies on `prefers-color-scheme` + a `body.dpp-theme-dark` fallback. When the user manually switches theme and the system color scheme is opposite, the panel and page are inverted.
- `--dpp-ui-*` is attached to body with no mapping comments, and is kept in sync with the sidepanel `:root` definitions by hand copying, with a risk of drift.

## 5. Competitor References (Claude Code Desktop and others)

Three information-architecture disciplines worth learning from Claude Code:
1. **Tool calls collapse to one line by default** (name + status icon), expanded on click — see [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop), [Agent View](https://code.claude.com/docs/en/agent-view).
2. **Status is conveyed by icon color + animation, not text blinking** (yellow = waiting for input / red = error / green = success).
3. **Low-frequency row summaries + numbers**: elapsed time/token counts, summaries updated at low frequency (at most once per 15s), no fake progress bars.

Cross-product consensus (Cursor [agent overview](https://docs.cursor.com/agent/overview), GitHub Copilot [manage agents](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents), OpenAI Codex [docs](https://developers.openai.com/codex/), Devin [docs](https://docs.devin.ai/)): a vertical stepping flow, the current step highlighted, stop/continue/retry placed next to the input box, accent colors only for the current step and errors, **collapsed is the default state**, hierarchy of 14px title / 13px body / 12px meta, corner radius 8-12px.

Injected components **should not learn**: global shortcuts (⌘K conflicts with DeepSeek), a toast system, taking over the host's scroll/focus/layout, imitating the host's brand colors. Confirmations are always inline and never block the input flow; the panel is collapsed by default and expanded while running.

## 6. Redesign Roadmap

### Batch P0 (GitHub Issue #<P0>, separate branch + PR)
1. Make the `executing_tools` state actually take effect (hook up `AGENT_TOOL_DETECTED`, showing "Executing tools" live).
2. Streaming rendering must not hijack scrolling: do not force scroll-to-bottom when the user has scrolled up (check the scrollTop position before scrolling), and progressively move to incremental updates.
3. Use a neutral "Paused" state for stop/budget exhaustion, dropping the green completion style; align the footer semantics.

### Batch P1 (subsequent separate Issue)
- Visual: unicode icons → inline SVG; font sizes 9/10/11px → start at 12px, body 14px; unify corner radii at 12px cards + 6px controls; fix contrast; eliminate unconsumed tokens and duplicate rules.
- Interaction: change the running indicator to a bottom-right floating entry/inline (remove the max z-index); add "starting" feedback and silent-failure hints; remove the unconditional 800ms auto-collapse (respect the user's manual expansion instead).
- Accessibility: aria-live (role=status); a restored streaming step no longer freezes; unify truncation markers; reduced-motion covers the collapse transition.
- Design system: dark mode follows `body[data-ds-dark-theme]`; add a `--ds-* ↔ --dpp-ui-*` mapping comment table in `injected-theme.ts`.

## 7. Verification Chain (per batch, executed per AGENTS.md)

Targeted tests (including contract baselines such as `tests/inline-agent-event-protocol-golden.test.ts`) → `npm run compile` → `npm run prompt:freeze` (when copy/behavior changes are involved) → `npm run build:all` for affected browsers → `npm run verify:manifest-policy` / `verify:extension-utf8` (when manifest/artifact changes) → `npm run ci:quality`.
