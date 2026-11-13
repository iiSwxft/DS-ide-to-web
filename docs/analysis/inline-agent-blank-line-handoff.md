# Inline Agent Blank-Line Rendering Issue — Task Handoff Document

> Status: **✅ Resolved (2026-08-06, reproduced, fixed, and verified in a real browser)**; this file is kept as an investigation record.
> Repository: `zhu1090093659/deepseek-pp` (v1.13.0, a WXT/React/TS MV3 browser extension)
> Working directory: `/Users/zcl/code/deepseek-pp`

---

## 1. Symptoms Reported by the User (original description)

1. **At first** (Simplified Chinese; the gist of the user's words):
   > "After expanding Agent mode and running it, why is there a blank line between every line of text in the final generated content? I feel there is something wrong with the rendering"
2. Then added: the content inside the **step 1/2/3 step boxes** has the same blank lines.
3. The user confirmed: **the blank lines disappear when the extension is disabled** → the blank lines are caused by the DeepSeek++ extension (not native DeepSeek page behavior).
4. In the latest round the user gave the **specific problematic content** (final output):

   ```
   V. Core tension: three major contradictions

   #### 1. 🟢 Cloud computing supercycle vs. 🔴 Massive capital expenditure
   Google Cloud grew 82% year over year, backlog $514 billion, operating margin 35.6%

   But capital expenditure doubled to the $200 billion range, and free cash flow turned negative
   ```

   The user's comment: "**It isn't rendered properly and the blank lines still exist**" — i.e., a level-4 markdown heading like `#### 1.` was not rendered as a heading, and there are blank lines between paragraphs.
5. The user's latest explicit request (verbatim):
   > "Can we just use its native content rendering? We only need to change the Inline-Agent UI and UX, and keep using the native strategy for content rendering"
   
   **Interpretation**: The user wants the **content rendering behavior of the final answer / step body to align with the DeepSeek page's native markdown rendering** (headings, lists, and paragraphs rendered as standard markdown, compact with no blank lines), with the extension responsible only for the panel UI/UX.
6. The user's latest feedback: "**It's still not solved~ Forget it, write a task handoff prompt and I'll have another Agent do it**" — i.e., this handoff document.

---

## 2. System Architecture (must be understood before taking over) — ⚠️ the correct understanding after the user's correction on 2026-08-06

> **Important correction (user's words)**: "I found that you misunderstood Agent mode. Agent mode means calling the extra tools we provide, including mcp, web_search, and so on."
>
> That is: **Agent mode = DeepSeek++'s inline-agent loop calling the tools provided by the extension (mcp, web_search, artifact, etc.), with tool execution results displayed in the step cards of the extension panel**. The investigation scope **must include the tool-result rendering path**, not just the model text stream.

- DeepSeek++ intercepts requests and streams of the DeepSeek web app (`chat.deepseek.com`) (MAIN world injection `entrypoints/main-world.content.ts` → `core/interceptor/fetch-hook.ts`).
- **Agent mode (the extension's inline agent)**: the user asks a question on the DeepSeek page → the extension injects the tool prompt → the model outputs `<tool_call>...</tool_call>` XML blocks (calling extension tools such as mcp / web_search / artifact) + plain text, and its output habit is to "separate each line/paragraph with `\n\n`".
- The extension's loop (`core/inline-agent/pi/loop-adapter.ts`) executes the tool calls (mcp, web_search, etc.), and the tool **execution results** are rendered into the step cards via `addToolResultToStep` / `addToolResultDetailsToStep`.
- The fetch-hook's `XmlToolStreamFilter` (`core/interceptor/fetch-hook.ts`) **strips** the tool-call XML from the text flowing to the page and feeds the "clean text" back to the DeepSeek page, and **the page renders this text with its native renderer** (the page's middle area, i.e. what the user calls "the middle area of the DS web page").
- The extension also has its own **Inline-Agent panel** (`core/inline-agent/`): mounted in the page's message area (`mountInlineAgentContainer` → `getAssistantResponseHost(message).appendChild(container)`), with step 1/2/3 step cards (`.dpp-agent-step-body`) and a final answer div (`[data-dpp-body-text]`) inside the panel, both rendered through `renderInlineMarkdown()` in `core/inline-agent/markdown.ts`.

**Both rendering paths must be checked**:
- **A. Native page rendering** (the "middle area" the user refers to): text source = the stream text after fetch-hook strips tool calls.
- **B. Extension panel rendering**: `renderInlineMarkdown()` (step body `updateStepStreamText`, final answer `appendInlineAgentFinalAnswer`).

---

## 3. Confirmed Root Causes (with test/simulation evidence)

### 3.1 Root cause 1: extra blank lines remain after tool call stripping (fixed)

Model output format: `preceding text\n\n<tool_call>...</tool_call>\n\nfollowing text`.
`XmlToolStreamFilter` only deletes the XML tags → leaves `preceding text\n\n\n\nfollowing text` (4 consecutive newlines) → the page renders "a blank line between every line".

**Fix** (already in the working tree, uncommitted):
- `core/interceptor/fetch-hook.ts`:
  - Added a `stripTailLeadingNewlines` state: when the text before the open tag ends with `\n`, the leading newlines of the tail after the close tag are collapsed;
  - Added `lastEmittedTextEndsWithNewline`: collapses across SSE frames (when the open tag is at the start of a new frame and the preceding text has already been flushed);
  - Added `emitCollapsedTrailingNewlines()`: all emitted text frames uniformly collapse `\n{3,}` → `\n\n` (including the EOF flush);
  - Added `cloneParsedWithCollapsedBlankLines()` / `collapseExcessBlankLines()`: **recursively handle BATCH / fragment structures** and **protect blank lines inside ``` fenced code blocks**;
  - Both complete blocks and trimmed blocks in `emitBlocksBeforeOpen` apply the collapse.
- `entrypoints/content.ts`: the DOM-level cleanup `stripToolCallTextNodes()` collapses in sync (including the cross-text-node state `lastNodeEndsWithNewline`, with a newly added `collapseRenderedExcessBlankLines()` that protects code blocks).

**Verification**: `tests/xml-tool-stream-filter.test.ts` gained 3 new regression tests (cross-frame flush collapse, plain text collapse + code block protection, collapse around tool calls), all green.

### 3.2 Root cause 2: the renderer does not recognize `####` (level-4 headings) and the heading level mapping is wrong (fixed)

The old `renderInlineMarkdown()`:
```ts
html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');  // Wrong mapping: ### should be h3
html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');   // Wrong mapping: ## should be h2
html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');    // Wrong mapping: # should be h1
```
→ `#### 1. ...` (4 #) **matches none of the rules** and is output verbatim as text → the user sees "not rendered properly".

**Fix** (already in the working tree, uncommitted): `core/inline-agent/markdown.ts`
```ts
html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
```
Also added: ordered list `^\d+\. ` → `<li>`, blockquote `^&gt; ` → `<blockquote>`, CRLF normalization, and `\n{2,}` collapse (no blank lines).
`core/inline-agent/renderer.ts`: `[data-dpp-body-text]` gained h1-h6 / li / blockquote styles.

**Verification**: the content the user pasted now renders as
`V. Core tension: three major contradictions<br><h4>1. 🟢 ...</h4><br>Google Cloud...<br>But capital expenditure...` (no `####` literal, no `<br><br>`).

---

## 4. Current Working Tree State

```
M core/inline-agent/markdown.ts          ← heading levels/ordered lists/blockquote/CRLF/collapse
M core/inline-agent/renderer.ts          ← data-dpp-body-text gained h1-h6/li/blockquote CSS
M core/interceptor/fetch-hook.ts         ← stream filter blank-line collapse (cross-frame/BATCH/fragment/code block protection)
M entrypoints/content.ts                 ← DOM-level strip collapse + stripToolCallTextNodes collapse
M tests/inline-markdown.test.ts          ← new heading/list/blockquote/CRLF tests
M tests/inline-agent-renderer.test.ts    ← updated assertions
M tests/xml-tool-stream-filter.test.ts   ← 3 new collapse regression tests
```

- `npm run compile`: passes
- Full `npx vitest run`: **1661 passed**
- `npm run build:all`: passes, artifacts `dist/chrome-mv3/`, `dist/edge-mv3/`, `dist/firefox-mv3/` (`dist/chrome-mv3-dev` was deleted at the user's request)
- `verify:manifest-policy` / `verify:extension-utf8`: pass
- Note: **none of the above changes are committed** (git status shows M)

---

## 5. Why the User Still Says "Not Solved" — Unverified Hypotheses (the focus for the next owner)

⚠️ Key point: the earlier rounds of fixes were all **code-level reasoning + unit tests**, and **were never verified in a real browser against a real Agent stream**. The user repeatedly confirms "still not solved", which means at least one path was missed. After taking over, **the first priority is reproduction**.

### ⚠️ Hypothesis E (added after the user's correction on 2026-08-06, the most suspicious): the tool-result rendering path was never collapsed

The user's correction: "Agent mode means calling the extra tools we provide, including mcp, web_search, and so on."

**This path has never been checked for the blank-line problem**:

- In `core/inline-agent/renderer.ts`:
  - `addToolResultToStep()` (@~760): the tool summary line `.dpp-agent-tool-summary` is set directly with **`detail.textContent = summary`**;
  - `addToolResultDetailsToStep()` (@~870) → `appendResultLine()`: the tool result details `.dpp-tool-result-line` are set directly with **`line.textContent = `${key}: ${value}``**;
- Corresponding CSS:
  - `.dpp-agent-tool-summary { white-space: pre-wrap; }` (@~397)
  - `.dpp-agent-step-tool-result-body { white-space: pre-wrap; }` (@~443)
- **`textContent` + `white-space: pre-wrap` = the raw text rendered verbatim**. web_search results (with `\n\n` between each result) and multi-line content returned by mcp would **display blank lines verbatim**! This is a very likely source of "the last step / the final output still has blank lines" — **tool results are not markdown but plain text, and `\n\n` is a blank line**.
- The user's "blank lines disappear after refresh" also fits: during live runs tool results display verbatim with pre-wrap; after refresh the render is restored from the trace (`createRestoredInlineAgentContainer`)... (need to verify whether the restore path is also pre-wrap, or whether the summary in the trace has already been cleaned).

**To verify/fix direction**:
1. Actually run Agent mode once (triggering web_search / mcp calls), expand the tool result card, and confirm whether the blank lines come from here;
2. If confirmed: before setting `textContent` in `appendResultLine` / `addToolResultToStep`, apply **blank-line collapse** to the tool result text (`\n{2,}` → `\n`, preserving single newlines; note that tool results may contain code blocks/JSON, so handle carefully or collapse only runs of 3+ newlines), or switch to compact rendering at the CSS level;
3. Also check whether the restore path `createRestoredInlineAgentContainer` (`entrypoints/content.ts` @~6360) renders tool results consistently.

### Hypothesis A (most suspicious): the blank lines the user sees are in the **native page rendering path** (path A), not in the extension panel (path B)

Chain of evidence:
- The user keeps saying "**the middle area of the DS web page**" and "**the final output content**";
- The user's latest request "**directly use its native content rendering**" — indicating the user believes what is rendered now is not "native", i.e. what the user is looking at may be the **stream text rendered by the page** (the text stripped by fetch-hook rendered by the DeepSeek page renderer), or the **div the extension panel inserts into the page message area** (`data-dpp-body-text` is appended to `container.parentNode`, and the container is inside responseHost — **this div is right inside the page message area** and may be affected by page CSS!).

**To verify**:
1. Actually run Agent mode once and inspect with DevTools:
   - The DOM structure of the "final output content" on the page: is it a native page message (inside `.ds-message`) or the `[data-dpp-body-text]` div inserted by the extension?
   - If it is the `[data-dpp-body-text]` div: do the CSS rules of its parent container (responseHost `._74c0879` / `.ds-assistant-message-main-content`) apply to it? **The page's own CSS (such as `.ds-markdown p { margin }`, `white-space: pre-wrap`) may act on elements inside the div inserted by the extension**, causing blank lines/layout anomalies.
2. If the blank lines come from page CSS affecting the extension-injected div → fix direction: **do not reuse the page message-area container**, or give `[data-dpp-body-text]` / `.dpp-agent-step-body` stricter scoped CSS (`all: initial` or per-rule overrides of margin/padding/line-height/white-space), or, per the user's request to "use native rendering", **hand the final answer text directly to the page's native renderer** (not innerHTML ourselves, but reuse the page's mechanism for rendering messages? or at least fully align the CSS with the page's markdown styles).

### Hypothesis B: in the real stream, 3+ newlines still remain after tool call stripping (a form not covered by the current collapse)

The simulated tests covered three event types, `response/content`, `response/fragments`, and BATCH, but **the shape of the real DeepSeek stream may differ from the simulation**:
- There may also be a `reasoning_content` / thinking path (`isThinkingPatchPath`) — `extractResponseTextFromParsed` **does not extract thinking text**, and `processFrames` passes frames with `text === null` through directly, so **tool-call XML inside thinking text is not stripped**, and the page will render the XML and even blank lines;
- There may be multi-level nested BATCH / fragment combinations;
- The model output's newlines may be a mix of `\r\n` + `\n` (CRLF normalization has been done, but the DOM-side `stripToolCallTextNodes` has no CRLF normalization!).

**To verify**:
1. Capture a real Agent stream (the fetch response), dump the parsed structure of all SSE frames, and confirm the full set of event types;
2. Feed the real frames through `XmlToolStreamFilter` and compare whether the stripped text contains `\n\n\n`;
3. If the thinking path is confirmed to contain XML → the filter needs to strip/collapse thinking text as well (note: stripping tool calls inside thinking may affect the page's "deep thinking" display, which needs evaluation).

### Hypothesis C: the textDiv of `appendInlineAgentFinalAnswer` is a duplicate rendering

- `appendInlineAgentFinalAnswer(container, ...)` appends the textDiv to `container.parentNode` (i.e. responseHost, the page message area).
- If the DeepSeek page **also renders the final answer message itself** (inside `.ds-message`), **two copies of the final answer** will appear on the page (one native page copy + one inserted by the extension), and what the user sees may be the extension's copy (poorly rendered) or both overlapping (even messier).
- **To verify**: confirm with a real page screenshot whether there are two copies; if so → per the user's request "use the native strategy for content rendering", **consider removing the textDiv self-rendering and keeping only the page's native copy** (but confirm that the loop's finalText matches the text rendered by the page and that the page's copy has no residual tool call XML).

### Hypothesis D: CSS scoping problem of the step box (`.dpp-agent-step-body`)

- The CSS of `.dpp-agent-step-body` is defined in `core/inline-agent/renderer.ts` (h2/h3/h4, p, ul/ol, li, pre, table, etc.) — but **these selectors are global** (a `<style>` injected into document.head), and if the page's own CSS has higher priority or a class collision, they may be overridden.
- Check whether the injected styles actually take effect (DevTools computed style).

---

## 6. User Requirements (final acceptance criteria)

1. The rendering of the **final output** (the kind of long text the user pasted, containing `####` headings, lists, and paragraphs) is **consistent with the DeepSeek page's native markdown rendering**:
   - `#### 1. ...` → rendered as a level-4 heading (`<h4>`);
   - **no extra blank lines** between lines/paragraphs (compact paragraphs, like native page messages);
   - lists, bold, code blocks, and tables work normally.
2. The **step 1/2/3 step box body** is likewise compact with no blank lines and with normal headings.
3. The extension's UI/UX (top-right indicator, step card styles, etc.) stays as is, with no regressions.

---

## 7. Reproduction Steps (mandatory for the next owner)

1. `cd /Users/zcl/code/deepseek-pp && npm install` (if needed)
2. `npm run build:chrome` → `dist/chrome-mv3/`
3. Chrome → `chrome://extensions` → Developer mode → Load unpacked → select `dist/chrome-mv3`
4. Open `chat.deepseek.com` and start an Agent-mode question (deep thinking + web search), **with a question that triggers tool calls + a long final output** (such as "analyze Google's earnings report and list the three major contradictions")
5. Observe:
   - The final answer in the page's middle area: are there blank lines, is `####` rendered as a heading
   - The extension panel step boxes: are they compact
   - DevTools Elements panel: locate the DOM of the final answer (page-native vs `[data-dpp-body-text]`) and inspect its parent container and the effective CSS
   - DevTools Network: capture the SSE response and dump the frame structure (the `data:` line JSON)
6. The user's earlier verification habit: after **reloading the extension + refreshing the page**, look at the result (the content script is injected on page load, so both steps are needed).

---

## 8. Common Commands

```bash
npm run compile                # tsc --noEmit
npx vitest run <file>          # unit test
npx vitest run                 # full (currently 1661 passing)
npm run build:chrome           # Chrome only
npm run build:all              # Chrome + Edge + Firefox
npm run verify:manifest-policy
npm run verify:extension-utf8
```

## 9. Quick Reference of Key Code Locations

| Concern | File |
|---|---|
| Stream filter (strip tool call XML + blank line collapse) | `core/interceptor/fetch-hook.ts` (`XmlToolStreamFilter` class, `collapseExcessBlankLines`, `cloneParsedWithCollapsedBlankLines`) |
| Panel markdown renderer | `core/inline-agent/markdown.ts` (`renderInlineMarkdown`) |
| Panel styles | `core/inline-agent/renderer.ts` (`injectInlineAgentStyles`, `[data-dpp-body-text]`, `.dpp-agent-step-body`, `.dpp-agent-tool-summary`, `.dpp-agent-step-tool-result-body`) |
| **Tool result rendering (⚠️ path not yet checked for blank lines)** | `core/inline-agent/renderer.ts` (`addToolResultToStep` @~760, `addToolResultDetailsToStep` @~870, `appendResultLine` @~925) — `textContent` + `white-space: pre-wrap` renders tool results (returned by web_search/mcp) verbatim, so `\n\n` displays as a blank line |
| Final answer insertion | `entrypoints/content.ts` (`appendInlineAgentFinalAnswer` @~4080, `handleAgentLoopComplete` @~4015, restore path `mountRestoredInlineAgentContainer` @~6418) |
| Live step body rendering | `entrypoints/content.ts` (`renderInlineAgentStreamChunk` @~3941), `core/inline-agent/renderer.ts` (`updateStepStreamText` @~696) |
| DOM-level tool call cleanup | `entrypoints/content.ts` (`stripToolCallTextNodes` @~6941, `collapseRenderedExcessBlankLines`) |
| Panel mounting into the page message area | `entrypoints/content.ts` (`mountInlineAgentContainer` @~3650, `getAssistantResponseHost` @~6530) |
| Agent final text assembly (background loop) | `core/inline-agent/pi/loop-adapter.ts` (`resolvedFinalText`, `finalize()`) |
| Text normalization (strip + normalize) | `core/interceptor/tool-parser.ts` (`stripToolCalls`), `core/inline-agent/prompt.ts` (`normalizeInlineAgentFinalAnswerText`) |

## 10. Project Rules Reminder (AGENTS.md key points)

- Root-cause fixes first, keep changes minimal in scope; keep `tests/inline-agent-event-protocol-golden.test.ts` (10 contract tests) all green.
- Verification order: targeted tests → `npm run compile` → (`npm run prompt:freeze` when prompt/tool/behavior is involved) → `npm run build:all` → `verify:manifest-policy` / `verify:extension-utf8` → `npm run ci:quality`.
- Do not add persistence keys; do not introduce Android/mobile.
- Before finishing: verify by reproducing in a real browser, do not rely only on unit tests.

---

## 11. ✅ Final Root Cause and Fix (2026-08-06, verified in a real browser)

### Reproduction method (actually performed this time)

- Environment: ego-browser (ego lite Chromium) loading `/Users/zcl/code/deepseek-pp/dist/chrome-mv3` (unpacked), inheriting the user's login state.
- Steps: `chat.deepseek.com` → expert mode → ask "Please use the web_search tool to search for today's important tech news and summarize 3 key points" → the agent loop actually executes web_search + web_fetch → observe the step boxes and the final answer DOM.
- ⚠️ Note: after changing code you must **reload the extension (chrome://extensions → reload) + close all old tabs and open a fresh one**, otherwise the content script is still the old version (a pitfall hit this time: after the reload an old tab was reused, the DOM showed the old rendering, and the fix was mistakenly thought ineffective).

### The real root cause (a combination of hypotheses A/D, not hypothesis E)

- The native page path (path A) **never had a blank-line problem**: `.ds-markdown` natively renders compact paragraphs as `<p class="ds-markdown-paragraph">`, and the previous round's fetch-hook collapse fix was already sufficient.
- The real source of the blank lines is the **extension panel renderer `renderInlineMarkdown`** (path B):
  1. After collapsing `\n{2,}` into `\n`, it **converts every `\n` into `<br>`** (`html.replace(/\n/g, '<br>')`);
  2. At the same time it outputs **bare `<li>`** (not wrapped in `<ul>/<ol>`) and **block-level elements** such as `<h1>`-`<h6>`;
  3. The resulting HTML becomes `...</li><br><li>...` / `<br><h4>...</h4><br>...` — the line boxes of `<br>` and block-level elements stack = **a double line break = a visual blank line between every line** (measured: the old rendering of the same content was 175px vs 130px in the native p style).
  4. The previous round wrote "`<br><h4>`" into the test assertions as correct behavior, masking the problem.
- Hypothesis E (tool result `textContent`+`pre-wrap`): measured web_fetch results have no `\n\n` (single-line JSON), and tool results are in the collapsed details area, not the main path of the user's complaint; unchanged.

### Fix details

`core/inline-agent/markdown.ts` was rewritten as **block-aware rendering** (`renderBlockLayout`):

- A blank line = a block separator, **producing no output** (spacing is controlled by CSS margin, aligned with native);
- Heading lines → `<h1>`..`<h6>`; list item lines → consecutive items merged into a single `<ul>/<ol>` (blank lines between items do not split the list); `>` lines → `<blockquote>`; tables/code blocks are output verbatim as blocks;
- Ordinary consecutive lines → `<p>` paragraphs (single newlines inside a paragraph keep a `<br>` soft break);
- Throughout, **no `<br>` appears between block-level elements**.

No CSS change is needed (`renderer.ts`): `[data-dpp-body-text] p { margin: 3px 0 }` and the `ul/ol/li/hN/blockquote` styles were already in place.

### Verification results

- Unit tests: the assertions in `tests/inline-markdown.test.ts` + `tests/inline-agent-renderer.test.ts` were updated to the new block-level structure (added `</p><h4>` and `<ol><li>...` assertions, removed the old `<br><h4>` assertion); full **1661 passed**.
- `npm run compile`, `npm run build:all`, `verify:manifest-policy`, and `verify:extension-utf8` all pass.
- **Real browser** (expert mode + web_search agent loop):
  - Step boxes: `<p>...</p><p>...</p><ol><li>...</li><li>...</li></ol>` — 0 `<br>`, compact;
  - Final answer `[data-dpp-body-text]`: `<p>`/`<h2>`/`<h3>`/`<ol>`/`<blockquote>` block-level structure, consistent with the page's native `.ds-markdown` (`<p class="ds-markdown-paragraph">`);
  - The `#### 1.` sample the user pasted: covered by a unit test → `<h4>`, with no `<br>` between blocks.
- Uncommitted content: `core/inline-agent/markdown.ts`, `tests/inline-markdown.test.ts`, `tests/inline-agent-renderer.test.ts`, this document.
