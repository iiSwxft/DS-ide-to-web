# Sidebar DeepSeek Chat + Context Menu Send

## Overview

Add a "Chat" tab (in the first position) to the DeepSeek++ sidebar, letting users chat with DeepSeek directly inside the sidebar. Chat calls the chat.deepseek.com web backend API through `core/deepseek/adapter.ts`, with no iframe embedding. Chat automatically carries the extension's memory, MCP tools, Presets, and other augmentation capabilities.

Add a new context menu feature: select text → right-click → DeepSeek++ → choose a scenario to send to the sidebar. Built-in scenarios (summarize/explain/translate) are included, with support for custom scenarios and Prompt templates.

## Architecture

```
Sidepanel (React)          Background (service worker)      Content Script
┌─────────────────┐       ┌──────────────────────┐       ┌─────────────────┐
│ ChatPage         │       │                      │       │ fetch-hook      │
│  sendMessage     │──────▶│ onMessage            │       │ capture token   │
│  ← stream chunks │◀──────│  CHAT_SUBMIT_PROMPT  │       │ store in storage│
│  ← OPEN_CHAT_    │       │                      │       │                 │
│     WITH_TEXT    │       │  contextMenus        │       │                 │
│                 │       │  onClicked            │       │                 │
│ SettingsPage    │       │                      │       │                 │
│ scenario mgmt   │       │                      │       │                 │
└─────────────────┘       └──────────────────────┘       └─────────────────┘
```

**Key data flows**:

1. **Token capture**: the content script intercepts DeepSeek's fetch requests → `rememberDeepSeekClientHeaders` → writes headers to `chrome.storage.local`
2. **Sending a message**: ChatPage → `chrome.runtime.sendMessage({type:'CHAT_SUBMIT_PROMPT', text})` → background
3. **API call**: background reads headers from storage → `createChatSession()` → `solvePow()` → `submitPromptStreaming()`
4. **Streaming back**: each time background receives an SSE chunk → `chrome.runtime.sendMessage({type:'CHAT_STREAM_CHUNK', text, done})` → ChatPage renders in real time
5. **Tool loop**: detect `<tool_call>` → execute the tool → submit a continuation → loop until the conversation ends
6. **Context menu send**: contextMenus.onClicked → open the sidebar → `sendMessage({type:'OPEN_CHAT_WITH_TEXT', text})` → ChatPage fills in the input box

## Key Decisions

### 1. Authentication approach: Content Script capture + Storage cache

The content script already calls `rememberDeepSeekClientHeaders` in `fetch-hook.ts`; on top of that, add one step: write the full headers object to `chrome.storage.local`. Background reads it from storage when needed.

Alternatives (Option B: offscreen document, Option C: direct content script calls) were ruled out due to high complexity or dependence on the tab staying alive.

### 2. API call location: Background

All DeepSeek API calls run in the background service worker. The Sidepanel interacts via message passing. Background has a long lifecycle and can cache the token and session state.

### 3. Streaming: Message Channel

Background broadcasts `CHAT_STREAM_CHUNK` messages using `chrome.runtime.sendMessage`. This is the simplest WXT-compatible approach.

### 4. Automatic injection of memory/MCP/Preset

Reuse `buildPromptAugmentation` (a function in `core/prompt`) to augment the prompt before background submits it. The process is consistent with `modifyRequestBody` in `fetch-hook.ts`.

### 5. Tool call execution

Follow the tool loop logic in `core/inline-agent/loop.ts`. While receiving the stream, background detects `<tool_call>` XML, calls `executeRuntimeToolCall` to execute it, and then submits the result to DeepSeek as a continuation prompt.

### 6. Context menu scenario model

Borrow the `ACTION_PRESETS` design from AI-Side-Panel-Extension. Each scenario has an ID, a name, and a Prompt template (containing a `{text}` placeholder). Three scenarios are built in, and custom scenarios are stored in `chrome.storage.local`.

## Component List

| Component | File path | Description |
|---|---|---|
| ChatPage | `entrypoints/sidepanel/pages/ChatPage.tsx` | Message list + input box + new-chat button |
| ChatMessage | `entrypoints/sidepanel/components/ChatMessage.tsx` | A single message bubble |
| ScenarioManager | `entrypoints/sidepanel/components/ScenarioManager.tsx` | The scenario management area placed in the settings page |
| ScenarioStore | `core/scenario/store.ts` | CRUD and storage for scenario configuration |

## Message Types

```
CHAT_SUBMIT_PROMPT    ChatPage → Bg    Submit a user message
CHAT_NEW_SESSION      ChatPage → Bg    Create a new session
CHAT_STREAM_CHUNK     Bg → ChatPage    Streaming text chunk
CHAT_STREAM_ERROR     Bg → ChatPage    Streaming error
OPEN_CHAT_WITH_TEXT   Bg → ChatPage    Fill the input box (triggered by context menu)
AUTH_STATUS           Bg → ChatPage    Authentication status notification
```

## ChatPage Internal State

```typescript
interface ChatState {
  messages: ChatMessage[];    // [{role:'user'|'assistant', text:string}]
  streamingText: string;     // Current streaming text
  isStreaming: boolean;      // Whether receiving
  inputText: string;         // Input box content
  hasToken: boolean;         // Whether a DeepSeek token is available
}
```

## Context Menu Structure

```
DeepSeek++
├── Send to chat            ← raw text
├───────────────
├── Summarize selection
├── Explain selection
├── Translate selection
├───────────────              (shown when custom scenarios exist)
├── [Custom scenario 1]
├── [Custom scenario 2]
```

## Scenario Configuration

```typescript
interface ScenarioConfig {
  id: string;          // 'summarize' | 'explain' | 'translate' | custom UUID
  label: string;       // Display name
  template: string;    // Prompt template, "Please summarize: {text}"
  builtIn: boolean;    // Whether built-in
  enabled: boolean;    // Whether enabled
}
```

Built-in scenarios (cannot be deleted; the template and enabled/disabled state can be edited):
- `summarize`: template `"Please summarize the following content concisely: {text}"`
- `explain`: template `"Please explain the following content: {text}"`
- `translate`: template `"Please translate the following content into Chinese: {text}"`

## Settings Page Scenario Management UI

Add a new area at the bottom of SettingsPage:

```
┌─ Context menu scenarios ───────────────────────┐
│                                                  │
│  Built-in scenarios                              │
│  ☑ Summarize  Template: "Please summarize: {text}"   [Edit] │
│  ☑ Explain    Template: "Please explain: {text}"     [Edit] │
│  ☑ Translate  Template: "Please translate: {text}"   [Edit] │
│                                                  │
│  Custom scenarios                    [+ Add]     │
│  (empty)                                         │
└──────────────────────────────────────────────────┘
```

## Error Handling

| Situation | What the user sees |
|---|---|
| Token not captured | Prompt "Please log in to chat.deepseek.com and send a message first" |
| Token expired | Prompt "Authentication has expired, please refresh chat.deepseek.com" |
| API error | A red error notice is shown in the message list |
| Stream interrupted | Shows "Connection interrupted, please retry" |
| Tool call failed | The failure reason is shown in the execution result, and the conversation continues |

## Non-Goals

- Do not persist chat messages (cleared on close)
- Do not implement enhanced interactions such as message edit/delete/copy
- Do not implement multi-AI-service switching
- Do not change the existing memory/Skill/MCP management features

## Implementation Order

1. Manifest permissions + Content script token storage
2. Background context menu + scenario store
3. Sidepanel chat page (ChatPage + ChatMessage)
4. Background chat API routing (including the tool loop)
5. Settings page scenario management UI
6. Context menu → input box prefill integration
