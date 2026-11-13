---
description: Check that the DeepSeek bridge is connected and walk through whatever is missing
---

Check whether the DeepSeek bridge is ready to use, and help me fix whatever is missing.

1. Call the `deepseek_status` tool.
2. If it reports `"extensionConnected": true` and `"loggedIn": true`, tell me it is ready and stop.
3. Otherwise read the `error` field and tell me the one thing to do, using this guide:
   - `extensionConnected` is false: the DeepSeek Bridge browser extension is not connected. I need to install it (Firefox: open the signed `.xpi` from https://github.com/iiSwxft/DS-ide-to-web/releases/latest; Chrome or Edge: unzip the release zip and load it unpacked from `chrome://extensions`), then open https://chat.deepseek.com signed in.
   - connected but the page script is not running on a DeepSeek tab: I need to refresh the chat.deepseek.com tab.
   - not logged in: I need to sign in on the DeepSeek tab.
4. Do not retry in a loop. Say what to do, then wait for me to tell you it is done and call `deepseek_status` once more.

The bridge app starts by itself with this MCP server, so never ask me to start it. If the tool fails with "Cannot reach the DeepSeek bridge app", tell me to check `~/.ds-ide-to-web/daemon.log`.
