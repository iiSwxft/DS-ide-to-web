# DeepSeek++ Privacy Policy

Effective date: 2026-07-14

DeepSeek++ is a browser extension that enhances DeepSeek chat workflows with user-controlled floating chat on normal web pages, memory, skills, project context, saved items, prompt presets, MCP tools, side-panel Vision image attachments, multimodal media analysis, browser control tools, inline tool execution, local exports, downloadable artifacts, optional sync, automation, and optional side-panel chat.

This Privacy Policy explains what data the extension handles, how that data is used, when it may be transferred, and what controls users have.

## 1. Single Purpose

DeepSeek++ has one purpose: to enhance DeepSeek chat workflows with user-controlled floating chat on normal web pages, memory, skills, projects, saved items, presets, tools, side-panel Vision image attachments, multimodal media analysis, browser control, local exports, optional sync, automation, and optional side-panel chat that the user controls.

## 2. Data Handled by the Extension

DeepSeek++ may handle the following data only when needed for its user-facing features:

- DeepSeek conversation content, including prompts, model responses, and tool-call text shown on `chat.deepseek.com`.
- User-created extension data, including memories, skills, local Skill supporting files selected by the user, project context, project files or source notes, saved snippets, bookmarks, prompt presets, MCP server settings, automation tasks, theme settings, background settings, pet settings, and tool execution history.
- Optional DeepSeek API Key, when the user configures official API chat in the side panel.
- Optional OpenAI and Gemini API keys, model names, and request URLs, when the user configures multimodal image or video analysis.
- Optional sync settings, including WebDAV server URL, username, password, remote path, Google Drive or OneDrive OAuth app credentials, sync authorization tokens, provider selection, and sync state, when the user configures sync.
- Optional MCP configuration, including endpoint URLs, request headers, environment variables, native host names, discovered tool metadata, and tool results, when the user configures MCP tools.
- User-selected image files, file names, MIME types, file sizes, upload state, and DeepSeek file references, only when the user explicitly attaches images in side-panel Vision mode.
- User-selected image or video files, file names, MIME types, file sizes, and analysis results, only when the user explicitly attaches media for multimodal analysis.
- Browser tab titles, URLs, Accessibility Tree snapshots, and browser-control tool results only when the user enables Browser Control and selects or uses a controlled tab.
- Normal web pages may be modified locally to display the DS++ Chat floating launcher. The launcher does not automatically read or send page body content.
- DeepSeek session data available to the web page, only when needed to submit user-requested automation or continuation prompts.
- DeepSeek conversation history, individual message text, saved items, generated artifact content, and attachment metadata when the user explicitly starts a local export or download.

DeepSeek++ does not intentionally collect financial information, health information, precise location, payment information, or browsing history.

## 3. How Data Is Used

DeepSeek++ uses handled data only to provide its disclosed features:

- Store and retrieve local memories, skills, project context, saved items, presets, settings, tasks, MCP configuration, and tool history.
- Select relevant memories, skills, projects, saved items, presets, and tool definitions for use in DeepSeek prompts.
- Detect tool-call markup in DeepSeek responses, execute enabled tools, and render readable tool results.
- Return selected tool results to the active DeepSeek conversation when the user enables tool execution.
- Send side-panel chat messages to the official DeepSeek API when the user configures a DeepSeek API Key.
- Show a user-controllable DS++ Chat floating launcher on normal web pages. The launcher can be turned off from Appearance settings and does not automatically send page body content.
- Attach user-selected images to a side-panel web chat message in Vision mode when the user explicitly selects or pastes images and sends that message.
- Analyze user-selected images or videos through the local Multimodal Native Host and the user's configured OpenAI/Gemini-compatible endpoints when the user attaches media for multimodal analysis.
- Run automation tasks created by the user.
- Export the user's DeepSeek conversation history, individual messages, saved items, or generated artifacts into local files when the user starts an export or download.
- Sync memories, custom skills, and presets to a user-configured WebDAV server, Google Drive app data area, or OneDrive app folder when sync is enabled.
- Connect to user-configured MCP endpoints or Native Messaging hosts when the user tests or executes those tools, including reading supporting files from a local Skill folder selected by the user when that Skill requires them.
- Control a selected browser tab through Chrome's debugger API when the user enables Browser Control and the AI calls an enabled `browser_*` tool.

The extension does not use handled data for advertising, user profiling for advertising, credit decisions, or unrelated analytics.

## 4. Local Storage

Most extension data is stored locally in the user's browser using extension storage and IndexedDB. This includes memories, custom skills, project context, saved items, presets, settings, automation tasks, MCP configuration, DeepSeek API Key, multimodal API settings, and tool execution history.

Conversation export artifacts, saved-item exports, and generated downloadable files are created only after the user starts an export or download and are saved through the browser's local download flow. DeepSeek++ does not upload exported files.

Local data remains in the browser until the user edits or deletes it, clears browser extension data, or uninstalls the extension.

## 5. Data Transfer and Sharing

DeepSeek++ does not operate a backend service for collecting extension data. The extension does not sell user data.

Data may be transferred only as part of user-facing features:

- To DeepSeek, when the user sends a chat message, attaches selected images in side-panel Vision mode, runs an automation task, or allows the extension to return selected context or tool results to a DeepSeek conversation.
- To the official DeepSeek API, when the user configures a DeepSeek API Key and sends a side-panel chat message.
- To Bing (`cn.bing.com` or `www.bing.com`), when the user invokes the built-in web search tool; the search query is sent to Bing and the resulting titles, links, and snippets are returned to the active DeepSeek conversation.
- To the local Multimodal Native Host, and from that host to user-configured OpenAI/Gemini-compatible endpoints, when the user attaches images or videos for multimodal analysis.
- To a WebDAV server, Google Drive app data area, or OneDrive app folder selected and configured by the user, when the user enables sync.
- To MCP endpoints selected and configured by the user, when the user tests or executes MCP tools.
- To a local Native Messaging host configured by the user, when local/native MCP or multimodal tooling is enabled.
- To DeepSeek as text tool results, when Browser Control returns the selected tab's Accessibility Tree snapshot or action result to the active conversation.

The extension does not transfer user data to advertising platforms, data brokers, information resellers, or unrelated third parties.

## 6. Permissions

DeepSeek++ requests these Chrome permissions for the following purposes:

- `storage`: store local memories, skills, project context, saved items, presets, settings, automation tasks, MCP configuration, and tool history.
- `alarms`: schedule and wake user-created automation tasks.
- `contextMenus`: let the user send selected page text to side-panel chat or a configured right-click scenario.
- `nativeMessaging`: connect to user-configured local MCP/native hosts, including the optional Shell and Multimodal Native Hosts.
- `offscreen`: host an invisible extension document that runs isolated JavaScript, TypeScript, Python, and HTML sandbox requests outside the DeepSeek page, preventing the chat tab from being blocked by sandbox execution.
- `debugger`: attach to a user-selected browser tab only when Browser Control is enabled, so DeepSeek++ can read an Accessibility Tree snapshot and perform user-visible browser actions requested through `browser_*` tools.
- `tabs`: list browser tabs and select the target tab for Browser Control. Tab group names may be shown when the browser exposes them without an additional required permission.
- `identity`: start the user-approved Google Drive or OneDrive OAuth sign-in flow when the user enables one of those sync providers.
- `sidePanel`: provide the extension management UI in Chrome's side panel.
- `<all_urls>` content script match: show the optional DS++ Chat floating launcher on normal web pages. The launcher skips DeepSeek pages to avoid duplicate UI, can be turned off from Appearance settings, and does not automatically read or send page body content.
- `*://chat.deepseek.com/*`: run on the DeepSeek web app so the extension can apply user-selected context, render tool results, export user-requested conversation history, support local downloads, and support automation inside DeepSeek conversations.
- `https://api.deepseek.com/*`: send side-panel chat requests to the official DeepSeek API when the user configures an API Key.
- `*://cn.bing.com/*` and `*://www.bing.com/*`: run the built-in web search tool only when the user requests a search, then return the resulting titles, links, and snippets to the active DeepSeek conversation.
- `https://accounts.google.com/*`, `https://oauth2.googleapis.com/*`, and `https://www.googleapis.com/*`: complete user-approved Google Drive sync sign-in and read/write the extension's sync file in the user's Google Drive app data area.
- `https://login.microsoftonline.com/*` and `https://graph.microsoft.com/*`: complete user-approved OneDrive sync sign-in and read/write the extension's sync file in the user's OneDrive app folder.
- Optional `http://*/*` and `https://*/*` host permissions: connect to user-configured WebDAV or MCP endpoints. These permissions are requested for specific origins when needed.

## 7. User Controls

Users can manage extension data from the DeepSeek++ side panel. Users can:

- View, create, edit, export, import, and delete memories.
- Create, edit, attach, and remove project context and project files.
- Create, search, insert, export, and delete saved snippets and bookmarks.
- Export DeepSeek conversation history as local HTML, Markdown, PDF, or image-manifest files.
- Export individual messages, saved items, and generated artifacts through local browser downloads.
- Create, edit, and delete custom skills and prompt presets.
- Change prompt controls such as memory injection, preset cadence, and response language.
- Enable, disable, test, edit, and delete MCP servers.
- Configure or remove multimodal API settings, install and enable the Multimodal Native Host, and attach or remove selected media before sending.
- Switch side-panel web chat between Default, Expert, and Vision modes, and attach or remove selected Vision images before sending.
- Enable or disable Browser Control, select the target tab, tune snapshot budgets, and detach from the current tab.
- Create, pause, run, edit, and delete automation tasks.
- Configure or remove the DeepSeek API Key used for official API side-panel chat.
- Turn the normal-page DS++ Chat floating launcher on or off from Appearance settings.
- Configure or remove WebDAV, Google Drive, or OneDrive sync settings.
- Clear or change visual settings such as background and pet preferences.
- Remove the extension or clear browser extension data through Chrome.

## 8. Security

DeepSeek++ stores extension data locally in the browser by default. Users should only configure trusted WebDAV servers, cloud sync accounts, MCP endpoints, and Native Messaging hosts. HTTPS endpoints are recommended for remote WebDAV and MCP connections.

The extension does not hardcode third-party credentials. Optional credentials, including DeepSeek API Key, OpenAI/Gemini API keys, WebDAV credentials, and Google/Microsoft OAuth app credentials or sync tokens, are provided by the user and stored locally for the features the user configures.

## 9. Chrome Web Store Limited Use

DeepSeek++ complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data handled by the extension is used only for the extension's disclosed, user-facing features.

DeepSeek++ does not:

- Sell user data.
- Use user data for personalized advertising.
- Transfer user data to advertising platforms, data brokers, or information resellers.
- Use user data for purposes unrelated to floating chat, memory, skills, tools, side-panel Vision image attachments, multimodal analysis, automation, sync, or extension settings.

## 10. Children

DeepSeek++ is not directed to children and does not knowingly collect personal information from children.

## 11. Changes to This Policy

This Privacy Policy may be updated when extension features, permissions, or data practices change. The effective date at the top of this document will be updated when material changes are made.

## 12. Contact

For privacy or support questions, open an issue at:

`https://github.com/zhu1090093659/deepseek-pp/issues`
