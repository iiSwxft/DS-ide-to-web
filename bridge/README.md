# DS Bridge: let any AI talk to your DeepSeek web chat

A small local bridge so that **any** tool (an MCP client, an IDE assistant, a script, anything that speaks the OpenAI API) can use the DeepSeek chat you are already logged in to in your browser.

```
 any AI / IDE / script
   |  OpenAI API  (http://127.0.0.1:8787/v1)         MCP (stdio) -> mcp-stdio.mjs
   v                                                      |
 daemon.mjs  <------------------ local HTTP --------------+
   |  WebSocket (127.0.0.1, key + extension-origin check)
   v
 browser extension (bridge/extension)  ->  chat.deepseek.com tab (your login, your PoW)
```

The extension reuses this fork's DeepSeek web client (`core/deepseek/*`: login headers, proof-of-work, SSE decoding), so there is a single copy of the protocol logic.

> Heads up: this automates the consumer web app with your own session. That is likely outside DeepSeek's terms of service and may get your account limited. For production use, prefer the official API. Use this for personal experiments.

## Setup (about a minute, no token to copy)

1. Start the bridge app (Node 20+), once:
   ```bash
   cd bridge/server && npm install && node daemon.mjs
   ```
2. Build and load the extension (from the repo root):
   ```bash
   node bridge/build.mjs
   ```
   This writes `bridge/build/chrome` and `bridge/build/firefox`.
   - Chrome/Edge: `chrome://extensions` -> Developer mode -> Load unpacked -> `bridge/build/chrome`.
   - Firefox (128+): `about:debugging#/runtime/this-firefox` -> Load Temporary Add-on -> `bridge/build/firefox/manifest.json` (removed on restart). Then `about:addons` -> DeepSeek Bridge -> Permissions and allow `chat.deepseek.com` (Firefox makes MV3 host access opt-in).
3. Open https://chat.deepseek.com signed in. The extension connects by itself whenever a DeepSeek tab is open and shows a small status pill on the page. The toolbar popup shows status and the base URL / API key to copy.

The extension and the app share a preset key (`deepseek-bridge`), so nothing needs configuring. To lock it down, set `DS_BRIDGE_TOKEN` (or put a value in `~/.ds-ide-to-web/token`) before starting the app and enter the same value under Advanced in the extension popup. `DS_BRIDGE_PORT` changes the port (default `8787`).

Check it: `curl -H "Authorization: Bearer deepseek-bridge" http://127.0.0.1:8787/api/status`

## Use it

**OpenAI-compatible** (Cursor, Continue, Open WebUI, LangChain, plain scripts...): base URL `http://127.0.0.1:8787/v1`, API key = `deepseek-bridge` (or your custom token).

| model id | meaning |
| --- | --- |
| `deepseek-web` | default model, thinking off |
| `deepseek-web-thinking` | default model, thinking on (`reasoning_content` is returned) |
| `deepseek-web-expert` | expert model, thinking on |

Extra body fields: `conversation_id` (continue a DeepSeek chat; returned in every response), `ds_search: true` (web search), `ds_thinking: true|false`. Tool/function calling is not supported. Multi-message histories are flattened into one prompt.

**MCP**: add `node /path/to/bridge/server/mcp-stdio.mjs` as a stdio MCP server. Tools:

| tool | what it does |
| --- | --- |
| `deepseek_ask` | send a prompt. Starts a new chat by default (`new_chat_title` names it); `chat` (id or title) or `conversation_id` continues one. Flags: `model`, `thinking`, `search`, `include_reasoning` |
| `deepseek_list_chats` | list your chats, optionally filtered by title |
| `deepseek_read_chat` | read a chat's messages by id or title |
| `deepseek_rename_chat` | rename a chat |
| `deepseek_pin_chat` | pin or unpin a chat |
| `deepseek_delete_chat` | permanently delete chats. Needs `confirm: true`, takes at most 20, and resolves every target before deleting any |
| `deepseek_status` | is the extension connected and logged in |

The same actions are plain HTTP on the bridge: `POST /api/ask`, `GET /api/chats`, `GET /api/chat?chat=`, `POST /api/chat/rename`, `POST /api/chat/pin`, `POST /api/chat/delete`. `/v1/chat/completions` also accepts `chat` and `new_chat_title`.

Chat titles are matched exactly first, then by unique substring; an ambiguous title is refused with the candidates listed rather than guessed.

The extension can only call a fixed allowlist of DeepSeek chat routes (list, history, rename, delete, pin, stop). It cannot reach account settings, logout, or "delete all history".

## System prompts and AI-to-AI work

DeepSeek's web chat has no system role, so instructions for a **new** chat are sent inside its first message (clearly labelled), and are never repeated when you continue the chat.

- `system` (any text) or `preset` on a new chat: `collaborator` (written for AI-to-AI work), `reviewer`, `concise`.
- A default for every new chat: set `DS_BRIDGE_SYSTEM`, or put text in `~/.ds-ide-to-web/system.txt`. An explicit `system`/`preset` wins.
- OpenAI endpoint: `system` messages become the chat's instructions on a new chat. When you pass `conversation_id` or `chat`, only your newest user message is sent, because DeepSeek already has the history.
- New chats get an automatic title made from the first message, which would include the instructions, so pass `new_chat_title`.

**Making your AI talk back and forth with DeepSeek.** The AI you are using drives the loop: it calls `deepseek_ask`, reads the reply, does its own work with it, and calls `deepseek_ask` again with the `conversation_id` from the previous reply. The MCP server ships these instructions to the client, so most assistants pick the pattern up on their own. Typical prompt to your assistant: *"Start a chat with DeepSeek using the collaborator preset, have it draft X, review what it says, push back on anything weak, and iterate until it is solid. Stop after at most 5 rounds."* The bridge does not run the loop itself, because the other side of the conversation has to be an AI that you pick.

## Security model

- Everything binds to `127.0.0.1`; requests whose `Host` header is not localhost are refused (no DNS rebinding).
- HTTP needs `Authorization: Bearer <key>` and refuses any request carrying a browser `Origin` header, so web pages cannot call it.
- The WebSocket only accepts `chrome-extension://` / `moz-extension://` origins plus the key.
- The default key is public by design, so any program running on your own computer can use the bridge (and therefore your DeepSeek session) while it runs. If that matters to you, set a custom token as described above and stop the app when you are not using it.

## Develop

```bash
cd bridge/server && npm test   # server tests use a fake extension over WebSocket
```
