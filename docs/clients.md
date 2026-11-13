# Using DeepSeek Bridge with other AI tools

DeepSeek Bridge is a standard MCP server that talks over stdio, so any AI tool that can run a local MCP server can use it. The command is always the same:

```text
npx -y github:iiSwxft/DS-ide-to-web
```

It starts the bridge app in the background by itself. You also need the browser extension installed and a signed-in https://chat.deepseek.com tab open (see the [README](../README.md#quick-start)).

> The formats below follow each tool's documented MCP configuration. Only Claude Code has been tested end to end. If a tool's format has changed, the command above is all you need to translate.

## Tools that run on your computer (these work)

| Tool | How to add it |
| --- | --- |
| **Claude Code** | `claude mcp add deepseek -- npx -y github:iiSwxft/DS-ide-to-web`, or install the plugin (see the README). |
| **Claude Desktop** | Add the JSON entry below to `claude_desktop_config.json` (Windows: `%APPDATA%\Claude\`, macOS: `~/Library/Application Support/Claude/`), then restart the app. |
| **Codex CLI** | `codex mcp add deepseek -- npx -y github:iiSwxft/DS-ide-to-web`, or add the TOML block below to `~/.codex/config.toml`. |
| **Cursor** | Add the JSON entry below to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project). |
| **Windsurf** | Add the JSON entry below to `~/.codeium/windsurf/mcp_config.json`. |
| **VS Code (Copilot agent mode)** | Add the `servers` block below to `.vscode/mcp.json`, or run the `code --add-mcp` command below. |
| **Cline** | In Cline, open *MCP Servers*, then *Configure MCP Servers*, and add the JSON entry below. |
| **Continue** | Create `.continue/mcpServers/deepseek.yaml` with the YAML below. |
| **Zed** | Add the block below under `context_servers` in Zed's `settings.json`. |
| **Gemini CLI** | Add the JSON entry below to `~/.gemini/settings.json`, or run `gemini mcp add deepseek npx -y github:iiSwxft/DS-ide-to-web`. |
| **opencode** | Add the block below to `opencode.json`. |
| **Goose** | `goose session --with-extension "npx -y github:iiSwxft/DS-ide-to-web"` |
| **Amp** | Add the entry below under `amp.mcpServers` in Amp's settings. |
| **Anything else with MCP** | Add a stdio server whose command is `npx` and whose arguments are `-y` and `github:iiSwxft/DS-ide-to-web`. |

### JSON entry (Claude Desktop, Cursor, Windsurf, Cline, Gemini CLI)

```json
{
  "mcpServers": {
    "deepseek": {
      "command": "npx",
      "args": ["-y", "github:iiSwxft/DS-ide-to-web"]
    }
  }
}
```

**On Windows**, some of these tools cannot start `npx` directly. If the server fails to start, use this instead:

```json
{
  "mcpServers": {
    "deepseek": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "github:iiSwxft/DS-ide-to-web"]
    }
  }
}
```

### Codex CLI (`~/.codex/config.toml`)

```toml
[mcp_servers.deepseek]
command = "npx"
args = ["-y", "github:iiSwxft/DS-ide-to-web"]
```

### VS Code (`.vscode/mcp.json`)

```json
{
  "servers": {
    "deepseek": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:iiSwxft/DS-ide-to-web"]
    }
  }
}
```

Or from a terminal: `code --add-mcp "{\"name\":\"deepseek\",\"command\":\"npx\",\"args\":[\"-y\",\"github:iiSwxft/DS-ide-to-web\"]}"`

### Continue (`.continue/mcpServers/deepseek.yaml`)

```yaml
name: DeepSeek Bridge
version: 0.0.1
schema: v1
mcpServers:
  - name: deepseek
    command: npx
    args:
      - "-y"
      - "github:iiSwxft/DS-ide-to-web"
```

### Zed (`settings.json`)

```json
{
  "context_servers": {
    "deepseek": {
      "source": "custom",
      "command": "npx",
      "args": ["-y", "github:iiSwxft/DS-ide-to-web"]
    }
  }
}
```

### opencode (`opencode.json`)

```json
{
  "mcp": {
    "deepseek": {
      "type": "local",
      "command": ["npx", "-y", "github:iiSwxft/DS-ide-to-web"],
      "enabled": true
    }
  }
}
```

### Amp

```json
{
  "amp.mcpServers": {
    "deepseek": {
      "command": "npx",
      "args": ["-y", "github:iiSwxft/DS-ide-to-web"]
    }
  }
}
```

## Tools that run in the cloud (these cannot reach it)

**Devin, Codex cloud, the GitHub Copilot coding agent, the Claude and ChatGPT web apps, and similar hosted agents do not work with this bridge.** They run on the provider's servers, not on your computer. The bridge works by talking to your own browser and your own signed-in DeepSeek session through `127.0.0.1`, which a remote machine cannot reach. Adding the server to Devin's MCP settings would start it inside Devin's virtual machine, where there is no browser and no DeepSeek login.

The only way to reach them would be to expose the bridge to the internet through a tunnel and give those tools a remote MCP address. That would put a service that controls your signed-in DeepSeek account on the public internet, protected only by a key. It is not built, and it should not be turned on casually. If you want it anyway, open an issue describing the tool you need.

## Using the same prompts everywhere

The starter prompts in [`prompts/`](../prompts) work in any of these tools. Paste one in, fill in the task, and the AI will use the `deepseek_*` tools to work with DeepSeek.
