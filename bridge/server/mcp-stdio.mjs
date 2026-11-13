#!/usr/bin/env node
/**
 * MCP (stdio) front door. Any MCP client (Claude, Cursor, Cline, Continue, ...)
 * can spawn this; it forwards tool calls to the running bridge daemon over
 * local HTTP, so several MCP clients can share one browser connection.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { HOST, getPort, loadToken } from './config.mjs';
import { MODELS } from './link.mjs';
import { PRESETS, presetNames } from './presets.mjs';

const base = `http://${HOST}:${getPort()}`;
const token = loadToken();

async function api(path, init = {}) {
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers },
    });
  } catch {
    throw new Error(`Cannot reach the DeepSeek bridge app at ${base}. It normally starts by itself with this MCP server; check ${'~/.ds-ide-to-web/daemon.log'}, or start it with: npx -y github:iiSwxft/DS-ide-to-web daemon`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Bridge returned HTTP ${res.status}`);
  return json;
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
const text = (value) => ({ content: [{ type: 'text', text: value }] });
const fail = (error) => ({ isError: true, content: [{ type: 'text', text: String(error.message ?? error) }] });
const guard = (fn) => async (args) => {
  try {
    return await fn(args);
  } catch (error) {
    return fail(error);
  }
};

const INSTRUCTIONS = [
  'These tools let you collaborate with DeepSeek, running in the user\'s browser, as a second AI.',
  'Working back and forth:',
  '1. Start with deepseek_ask WITHOUT a conversation_id. Give it a clear task and, on this first call, a `preset` ("collaborator" is meant for AI-to-AI work) or your own `system` text. Instructions only apply to a new chat.',
  '2. The reply ends with [conversation_id: ...]. Read DeepSeek\'s answer, do your own work with it (check it, extend it, fix it), then call deepseek_ask again WITH that conversation_id and your follow-up. DeepSeek remembers the whole chat, so send only the new message.',
  '3. Repeat until the task is done. Stop when you have what you need or when answers stop improving; do not loop forever.',
  'Use new_chat_title so the chat is easy to find later, then deepseek_list_chats / deepseek_read_chat to look back at it.',
  'If your own message was the problem, use deepseek_edit_message. If DeepSeek\'s answer was weak, use deepseek_regenerate. If its answer was cut off, use deepseek_continue. deepseek_list_models shows the models and presets.',
  'Deleting chats is permanent: only call deepseek_delete_chat when the user explicitly asked for those chats to be deleted.',
].join('\n');

const server = new McpServer({ name: 'ds-ide-to-web', version: '0.3.0' }, { instructions: INSTRUCTIONS });

server.registerTool('deepseek_ask', {
  title: 'Ask DeepSeek (web)',
  description:
    "Send a prompt to the DeepSeek web chat running in the user's logged-in browser and return the reply. " +
    'Omit chat and conversation_id to start a new chat. Pass the returned conversation_id, or a chat id/title, to continue one.',
  inputSchema: {
    prompt: z.string().min(1).describe('The message to send to DeepSeek.'),
    conversation_id: z.string().optional().describe('Continue a conversation returned by this tool.'),
    chat: z.string().optional().describe('Continue an existing DeepSeek chat by its id or title (or a unique part of the title).'),
    new_chat_title: z.string().optional().describe('Title for the new chat (only when starting a new chat).'),
    system: z.string().optional().describe('Instructions for the whole new chat (e.g. a role or rules). Only used when starting a new chat.'),
    preset: z.enum(presetNames()).optional().describe('Built-in instructions for a new chat: collaborator (AI-to-AI work), reviewer, concise. Ignored if system is given.'),
    model: z.enum(Object.keys(MODELS)).optional().describe('deepseek-web (default), deepseek-web-thinking, or deepseek-web-expert.'),
    thinking: z.boolean().optional().describe('Turn deep thinking on or off (overrides the model preset).'),
    search: z.boolean().optional().describe('Turn DeepSeek web search on for this message.'),
    include_reasoning: z.boolean().optional().describe("Also return the model's thinking text when available."),
  },
}, guard(async ({ prompt, conversation_id, chat, new_chat_title, system, preset, model, thinking, search, include_reasoning }) => {
  const out = await post('/api/ask', { prompt, conversation_id, chat, new_chat_title, system, preset, model, thinking, search });
  const parts = [out.text];
  if (include_reasoning && out.reasoning) parts.unshift(`<thinking>\n${out.reasoning}\n</thinking>`);
  parts.push(`\n[conversation_id: ${out.conversationId}]`);
  return text(parts.join('\n'));
}));

server.registerTool('deepseek_status', {
  title: 'DeepSeek bridge status',
  description: 'Check whether the browser extension is connected and logged in to chat.deepseek.com.',
  inputSchema: {},
}, guard(async () => text(JSON.stringify(await api('/api/status'), null, 2))));

server.registerTool('deepseek_list_chats', {
  title: 'List DeepSeek chats',
  description: "List chats in the user's DeepSeek account (pinned first, then newest). Optionally filter by title.",
  inputSchema: {
    limit: z.number().int().min(1).max(500).optional().describe('How many chats to return (default 30).'),
    query: z.string().optional().describe('Only chats whose title contains this text.'),
  },
}, guard(async ({ limit, query }) => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (query) params.set('q', query);
  const { chats } = await api(`/api/chats?${params}`);
  if (chats.length === 0) return text('No chats found.');
  return text(chats
    .map((c) => `${c.pinned ? '[pinned] ' : ''}${c.title || '(untitled)'}  |  ${c.id}  |  ${c.updatedAt ?? ''}`)
    .join('\n'));
}));

server.registerTool('deepseek_read_chat', {
  title: 'Read a DeepSeek chat',
  description: 'Read the messages of an existing DeepSeek chat, by id or title.',
  inputSchema: {
    chat: z.string().min(1).describe('Chat id, title, or a unique part of the title.'),
    include_reasoning: z.boolean().optional().describe('Include the assistant thinking text.'),
  },
}, guard(async ({ chat, include_reasoning }) => {
  const params = new URLSearchParams({ chat });
  if (include_reasoning) params.set('reasoning', '1');
  const out = await api(`/api/chat?${params}`);
  const lines = out.messages.map((m) => {
    const who = m.role === 'user' ? 'User' : 'DeepSeek';
    const thinking = m.reasoning ? `\n  <thinking>${m.reasoning}</thinking>` : '';
    return `${who}: ${m.text}${thinking}`;
  });
  return text(`# ${out.chat.title || '(untitled)'} (${out.chat.id})\n\n${lines.join('\n\n')}`);
}));

server.registerTool('deepseek_edit_message', {
  title: 'Edit a sent message and get a new answer',
  description:
    'Replace one of YOUR earlier messages in a DeepSeek chat and get DeepSeek\'s answer to the new text, like the pencil Edit button on the site. ' +
    'Use it when a message was unclear or wrong instead of sending a correction. Defaults to your latest message. ' +
    'Anything after the edited message is no longer part of the active conversation (the site keeps it as an older version), and the chat continues from the new answer.',
  inputSchema: {
    chat: z.string().optional().describe('The chat to edit: id, title, or a unique part of the title.'),
    conversation_id: z.string().optional().describe('Or the conversation_id returned by deepseek_ask.'),
    prompt: z.string().min(1).describe('The replacement text for your message.'),
    message_id: z.number().int().optional().describe('Which of your messages to replace (see deepseek_read_chat ids). Default: your latest message.'),
    model: z.enum(Object.keys(MODELS)).optional().describe('deepseek-web (default), deepseek-web-thinking, or deepseek-web-expert.'),
    thinking: z.boolean().optional().describe('Turn deep thinking on or off for the new answer.'),
    search: z.boolean().optional().describe('Turn web search on for the new answer.'),
    include_reasoning: z.boolean().optional().describe("Also return the model's thinking text when available."),
  },
}, guard(async ({ chat, conversation_id, prompt, message_id, model, thinking, search, include_reasoning }) => {
  const out = await post('/api/edit', { chat, conversation_id, prompt, message_id, model, thinking, search });
  const parts = [out.text];
  if (include_reasoning && out.reasoning) parts.unshift(`<thinking>\n${out.reasoning}\n</thinking>`);
  parts.push(`\n[edited message ${out.editedMessageId}; conversation_id: ${out.conversationId}]`);
  return text(parts.join('\n'));
}));

server.registerTool('deepseek_regenerate', {
  title: 'Regenerate DeepSeek\'s answer',
  description:
    'Make DeepSeek answer again, like the site\'s regenerate button. Use it when an answer was weak and the question was fine. ' +
    'Defaults to the latest answer. The old answer stays on the site as an older version, and the chat continues from the new one.',
  inputSchema: {
    chat: z.string().optional().describe('The chat: id, title, or a unique part of the title.'),
    conversation_id: z.string().optional().describe('Or the conversation_id returned by deepseek_ask.'),
    message_id: z.number().int().optional().describe('Which DeepSeek answer to redo (see deepseek_read_chat ids). Default: the latest.'),
    model: z.enum(Object.keys(MODELS)).optional().describe('deepseek-web (default), deepseek-web-thinking, or deepseek-web-expert.'),
    thinking: z.boolean().optional().describe('Turn deep thinking on or off for the new answer.'),
    search: z.boolean().optional().describe('Turn web search on for the new answer.'),
    include_reasoning: z.boolean().optional().describe("Also return the model's thinking text when available."),
  },
}, guard(async ({ chat, conversation_id, message_id, model, thinking, search, include_reasoning }) => {
  const out = await post('/api/regenerate', { chat, conversation_id, message_id, model, thinking, search });
  const parts = [out.text];
  if (include_reasoning && out.reasoning) parts.unshift(`<thinking>\n${out.reasoning}\n</thinking>`);
  parts.push(`\n[regenerated message ${out.regeneratedMessageId}; conversation_id: ${out.conversationId}]`);
  return text(parts.join('\n'));
}));

server.registerTool('deepseek_continue', {
  title: 'Continue a cut-off answer',
  description:
    'Ask DeepSeek to keep going when its latest answer was cut off mid-way, like the site\'s continue button. ' +
    'It only helps for answers that stopped early; for a complete answer DeepSeek may refuse.',
  inputSchema: {
    chat: z.string().optional().describe('The chat: id, title, or a unique part of the title.'),
    conversation_id: z.string().optional().describe('Or the conversation_id returned by deepseek_ask.'),
    message_id: z.number().int().optional().describe('Which DeepSeek answer to continue. Default: the latest.'),
  },
}, guard(async ({ chat, conversation_id, message_id }) => {
  const out = await post('/api/continue', { chat, conversation_id, message_id });
  return text(`${out.text}\n\n[continued message ${out.continuedMessageId}; conversation_id: ${out.conversationId}]`);
}));

server.registerTool('deepseek_list_models', {
  title: 'List models and presets',
  description: 'List the DeepSeek models and the built-in chat presets you can pass to deepseek_ask, with what each one does.',
  inputSchema: {},
}, guard(async () => {
  const models = Object.entries(MODELS)
    .map(([id, m]) => `- ${id}: ${m.modelType === 'expert' ? 'expert model' : 'default model'}, deep thinking ${m.thinking ? 'on' : 'off'}`)
    .join('\n');
  const presets = presetNames()
    .map((name) => `- ${name}: ${PRESETS[name].split(/(?<=\.)\s/)[0]}`)
    .join('\n');
  return text(`Models (the model parameter):\n${models}\n\nPresets (the preset parameter, new chats only):\n${presets}\n\nAlso: thinking true/false overrides a model's thinking setting, and search true turns on web search.`);
}));

server.registerTool('deepseek_rename_chat', {
  title: 'Rename a DeepSeek chat',
  description: 'Rename an existing DeepSeek chat.',
  inputSchema: {
    chat: z.string().min(1).describe('Chat id, title, or a unique part of the title.'),
    title: z.string().min(1).describe('The new title.'),
  },
}, guard(async ({ chat, title }) => {
  const out = await post('/api/chat/rename', { chat, title });
  return text(`Renamed chat ${out.id} to "${out.title}".`);
}));

server.registerTool('deepseek_pin_chat', {
  title: 'Pin or unpin a DeepSeek chat',
  description: 'Pin (default) or unpin an existing DeepSeek chat.',
  inputSchema: {
    chat: z.string().min(1).describe('Chat id, title, or a unique part of the title.'),
    pinned: z.boolean().optional().describe('true to pin (default), false to unpin.'),
  },
}, guard(async ({ chat, pinned }) => {
  const out = await post('/api/chat/pin', { chat, pinned: pinned !== false });
  return text(`Chat ${out.id} is now ${out.pinned ? 'pinned' : 'unpinned'}.`);
}));

server.registerTool('deepseek_delete_chat', {
  title: 'Delete DeepSeek chats (permanent)',
  description:
    'PERMANENTLY delete DeepSeek chats. This cannot be undone. Only call this when the user has explicitly asked to delete these specific chats, and set confirm to true.',
  inputSchema: {
    chats: z.array(z.string().min(1)).min(1).max(20).describe('Chat ids or exact titles to delete.'),
    confirm: z.boolean().describe('Must be true. Set it only after the user explicitly confirmed the deletion.'),
  },
}, guard(async ({ chats, confirm }) => {
  const out = await post('/api/chat/delete', { chats, confirm });
  return text(`Deleted ${out.deleted.length} chat(s): ${out.deleted.map((c) => `"${c.title ?? ''}" (${c.id})`).join(', ')}`);
}));

export async function runMcp() {
  await server.connect(new StdioServerTransport());
}

// Run directly (node mcp-stdio.mjs). Through cli.mjs this file is imported and runMcp() is called instead.
if (process.argv[1]?.endsWith('mcp-stdio.mjs')) await runMcp();
