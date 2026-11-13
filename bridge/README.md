# DS Bridge: let any AI talk to your DeepSeek web chat

A small local bridge so that **any** tool (an MCP client, an IDE assistant, a script, anything that speaks the OpenAI API) can use the DeepSeek chat you are already logged in to in your browser.

```
 any AI / IDE / script
   |  OpenAI API  (http://127.0.0.1:8787/v1)         MCP (stdio) -> mcp-stdio.mjs
   v                                                      |
 daemon.mjs  <------------------ local HTTP --------------+
   |  WebSocket (127.0.0.1, token + extension-origin check)
   v
 browser extension (bridge/extension)  ->  chat.deepseek.com tab (your login, your PoW)
```

The extension reuses this fork's DeepSeek web client (`core/deepseek/*`: login headers, proof-of-work, SSE decoding), so there is a single copy of the protocol logic.

> Heads up: this automates the consumer web app with your own session. That is likely outside DeepSeek's terms of service and may get your account limited. For production use, prefer the official API. Use this for personal experiments.

## Setup

1. Install and start the daemon (Node 20+):
   ```bash
   cd bridge/server && npm install && node daemon.mjs
   ```
   It creates a token in `~/.ds-ide-to-web/token` (override the folder with `DS_BRIDGE_HOME`, the port with `DS_BRIDGE_PORT`, default `8787`).
2. Build and load the extension (from the repo root):
   ```bash
   node bridge/build.mjs
   ```
   This writes `bridge/build/chrome` and `bridge/build/firefox`.
   - Chrome/Edge: `chrome://extensions` -> Developer mode -> Load unpacked -> `bridge/build/chrome`.
   - Firefox (128+): `about:debugging#/runtime/this-firefox` -> Load Temporary Add-on -> pick `bridge/build/firefox/manifest.json` (temporary add-ons are removed when Firefox restarts). Then open `about:addons` -> DS Bridge -> Permissions and allow access to `chat.deepseek.com`, because Firefox treats MV3 host permissions as opt-in.
3. Open the extension, paste the token, save. Keep a logged-in `chat.deepseek.com` tab open (the extension opens one in the background if none exists).
4. Check: `curl -H "Authorization: Bearer $(cat ~/.ds-ide-to-web/token)" http://127.0.0.1:8787/api/status`

## Use it

**OpenAI-compatible** (Cursor, Continue, Open WebUI, LangChain, plain scripts...): base URL `http://127.0.0.1:8787/v1`, API key = your token.

| model id | meaning |
| --- | --- |
| `deepseek-web` | default model, thinking off |
| `deepseek-web-thinking` | default model, thinking on (`reasoning_content` is returned) |
| `deepseek-web-expert` | expert model, thinking on |

Extra body fields: `conversation_id` (continue a DeepSeek chat; returned in every response), `ds_search: true` (web search), `ds_thinking: true|false`. Tool/function calling is not supported. Multi-message histories are flattened into one prompt.

**MCP**: add `node /path/to/bridge/server/mcp-stdio.mjs` as a stdio MCP server. Tools: `deepseek_ask` (prompt, optional `conversation_id`, `model`, `search`, `include_reasoning`) and `deepseek_status`.

## Security model

- Everything binds to `127.0.0.1`.
- HTTP needs `Authorization: Bearer <token>` and refuses any request that carries a browser `Origin` header, so web pages cannot call it.
- The WebSocket only accepts `chrome-extension://` / `moz-extension://` origins plus the token.
- The token never leaves your machine; do not share it or commit it.

## Develop

```bash
cd bridge/server && npm test   # server tests use a fake extension over WebSocket
```
