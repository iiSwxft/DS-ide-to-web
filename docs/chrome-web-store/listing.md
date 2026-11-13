# Chrome Web Store Listing Draft

Last updated: 2026-08-08

## Package

- Current version: `1.14.0`
- Upload package: `dist/deepseek-plus-plus-1.14.0-chrome.zip`
- Category: Productivity
- Default language: English (United States)
- Homepage URL: `https://github.com/zhu1090093659/deepseek-pp`
- Support URL: `https://github.com/zhu1090093659/deepseek-pp/issues`
- Privacy policy URL: publish `docs/chrome-web-store/privacy-policy.md` and use its public URL.

## Store Listing

### Name

DeepSeek++

### Short Description

Bilingual memory, floating chat, Skills, MCP tools, multimodal media, automation, Browser Control, and inline tools for DeepSeek.

### Detailed Description

DeepSeek++ enhances the DeepSeek web app with English and Simplified Chinese support, floating chat on normal web pages, persistent memory, reusable Skills, project context, saved snippets, built-in web search and page fetch tools, system prompt presets, MCP tool execution, Vision mode image attachments, multimodal image/video analysis, optional Browser Control, local conversation export, downloadable artifacts, optional sync, and scheduled automation.

Use it to keep useful facts across conversations, work in English or Simplified Chinese, open a lightweight DS++ Chat window from normal web pages, attach project material when a task needs context, search the web when current information is needed, fetch page text for summarization, trigger custom or imported Skills with slash commands, connect user-configured MCP tools, attach user-selected images in side-panel Vision mode, analyze user-selected images or videos through a local Multimodal Native Host, operate a user-selected browser tab after Browser Control is enabled, save and insert reusable snippets, export conversations locally, optionally sync extension data through WebDAV, Google Drive, or OneDrive, and let DeepSeek continue a task after tool results are returned. The extension runs on chat.deepseek.com for DeepSeek-specific enhancements and can show a user-controllable floating chat launcher on other web pages. The side panel manages memories, Skills, projects, saved items, presets, built-in tools, multimodal API settings, Browser Control, MCP servers, automation tasks, sync settings, and visual preferences.

Key features:

- Long-term memory for user profile, feedback, topic context, and references.
- English and Simplified Chinese UI, tool guidance, built-in Skill behavior, and continuation prompts.
- Floating DS++ Chat launcher on normal web pages, with an Appearance setting to turn it off.
- Project context and downloadable artifacts for reusable task materials and generated files.
- Saved snippets and bookmarks with search, prompt insertion, and Markdown/JSON export.
- Built-in web search and page fetch tools for current information and page summarization.
- Skill system with slash-command activation, bundled workflow Skills, user-defined prompts, and local or GitHub Skill imports.
- MCP tool management for user-configured remote or local tool services.
- Side-panel Vision mode for attaching user-selected images to the DeepSeek conversation only when the user sends the message.
- Multimodal media workflow for analyzing user-selected images through OpenAI and videos through Gemini after the user installs and enables the Multimodal Native Host.
- Optional Browser Control for a user-selected tab, with text snapshots and visible browser actions after the user enables it.
- Inline tool execution UI that keeps execution traces readable without exposing implementation markers.
- Agent-style continuation that can pass tool results back into the same conversation.
- Local export for DeepSeek conversation history, with readable HTML, Markdown, PDF, and image-manifest outputs.
- Scheduled automation tasks that can run manually or on a timer.
- Optional sync for memories, skills, and presets through WebDAV, Google Drive, or OneDrive.
- Local customization, including DeepSeek page background, floating chat visibility, and a small floating DeepSeek pet.

DeepSeek++ does not operate a backend service for extension data. User configuration and extension data are stored locally in the browser unless the user explicitly enables WebDAV, Google Drive, or OneDrive sync, connects a user-configured MCP endpoint/native host, sends selected images to DeepSeek by using side-panel Vision mode, or sends selected media to a user-configured multimodal provider through the local Multimodal Native Host. The floating chat launcher does not automatically read or send page body content; content enters chat only when the user types, sends, or uses a selected-text action.

## Assets

Mandatory assets prepared in this repo:

- Extension icon: `assets/chrome-web-store-icon-128.png` (`128x128`)
- Small promotional image: `assets/chrome-web-store-promo-small-440x280.png` (`440x280`)
- Top promotional image: `assets/chrome-web-store-promo-top-1400x560.png` (`1400x560`)
- Screenshot: `docs/chrome-web-store/assets/screenshot-inline-tools-1280x800.png` (`1280x800`)

Optional existing screenshots for future store-gallery polish:

- `assets/screenshot-inline-tools.png`
- `assets/screenshot-sidepanel-memory.png`
- `assets/screenshot-sidepanel-saved.png`
- `assets/screenshot-sidepanel-projects.png`
- `assets/screenshot-sidepanel-skill.png`
- `assets/screenshot-sidepanel-mcp.png`
- `assets/screenshot-sidepanel-tools.png`
- `assets/screenshot-sidepanel-browser.png`
- `assets/screenshot-sidepanel-automation.png`
- `assets/screenshot-sidepanel-settings.png`
