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
    throw new Error(`Cannot reach the DS bridge daemon at ${base}. Start it with: node bridge/server/daemon.mjs`);
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

const server = new McpServer({ name: 'ds-ide-to-web', version: '0.2.0' });

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
    model: z.enum(Object.keys(MODELS)).optional().describe('deepseek-web (default), deepseek-web-thinking, or deepseek-web-expert.'),
    thinking: z.boolean().optional().describe('Turn deep thinking on or off (overrides the model preset).'),
    search: z.boolean().optional().describe('Turn DeepSeek web search on for this message.'),
    include_reasoning: z.boolean().optional().describe("Also return the model's thinking text when available."),
  },
}, guard(async ({ prompt, conversation_id, chat, new_chat_title, model, thinking, search, include_reasoning }) => {
  const out = await post('/api/ask', { prompt, conversation_id, chat, new_chat_title, model, thinking, search });
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

await server.connect(new StdioServerTransport());
