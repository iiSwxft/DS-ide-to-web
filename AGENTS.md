# Notes for AI assistants

This repository is a local bridge that exposes the user's logged-in DeepSeek web chat as an OpenAI-compatible API and an MCP server, through a browser extension.

- **Setting it up or using it:** read the section "For AI assistants: setting this up and using it" in [README.md](README.md). It has the exact steps, which ones only the user can do, the MCP tool rules, and the error table.
- **Working on the code:**
  - `npm run typecheck`, `npm run build`, and `npm test` must pass before you commit. The server tests (`bridge/server/test`) need no browser.
  - `dist/ds-ide-to-web.mjs` is the MCP server and bridge app bundled into one file, and it is checked in on purpose: `npx` and the Claude Code plugin run it. After any change under `bridge/server`, run `npm run bundle` and commit the result. CI fails if it is stale.
  - The MCP server starts the bridge app itself (`bridge/server/autostart.mjs`); it must never write to stdout, which belongs to the MCP protocol.
  - `bridge/extension/src/vendor` is DeepSeek web client code taken from deepseek-pp. Keep changes there small and mention them in [NOTICE](NOTICE).
  - The extension may only call the allowlisted chat routes in `bridge/extension/src/content.ts`. Do not widen that list to account, settings, logout, or delete-all routes.
  - Deleting chats must keep requiring `confirm: true` and must resolve every target before deleting any.
  - Do not add secrets to the repo. The default key `deepseek-bridge` is public by design.
- **Commits:** commit and push changes to `main` as you go. Do not add `Co-Authored-By` trailers or tool-attribution lines to commit messages; the owner does not want AI tools or other accounts listed as contributors.
