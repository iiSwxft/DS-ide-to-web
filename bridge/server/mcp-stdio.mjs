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

const text = (value) => ({ content: [{ type: 'text', text: value }] });
const fail = (error) => ({ isError: true, content: [{ type: 'text', text: String(error.message ?? error) }] });

const server = new McpServer({ name: 'ds-ide-to-web', version: '0.1.0' });

server.registerTool('deepseek_ask', {
  title: 'Ask DeepSeek (web)',
  description:
    'Send a prompt to the DeepSeek web chat running in the user\'s logged-in browser and return the reply. ' +
    'Pass the returned conversation_id back to continue the same chat; omit it to start a new one.',
  inputSchema: {
    prompt: z.string().min(1).describe('The message to send to DeepSeek.'),
    conversation_id: z.string().optional().describe('Continue a previous conversation returned by this tool.'),
    model: z.enum(Object.keys(MODELS)).optional().describe('deepseek-web (default), deepseek-web-thinking, or deepseek-web-expert.'),
    search: z.boolean().optional().describe('Enable DeepSeek web search for this message.'),
    include_reasoning: z.boolean().optional().describe('Also return the model\'s thinking text when available.'),
  },
}, async ({ prompt, conversation_id, model, search, include_reasoning }) => {
  try {
    const out = await api('/api/ask', {
      method: 'POST',
      body: JSON.stringify({ prompt, conversation_id, model, search }),
    });
    const parts = [out.text];
    if (include_reasoning && out.reasoning) parts.unshift(`<thinking>\n${out.reasoning}\n</thinking>`);
    parts.push(`\n[conversation_id: ${out.conversationId}]`);
    return text(parts.join('\n'));
  } catch (error) {
    return fail(error);
  }
});

server.registerTool('deepseek_status', {
  title: 'DeepSeek bridge status',
  description: 'Check whether the browser extension is connected and logged in to chat.deepseek.com.',
  inputSchema: {},
}, async () => {
  try {
    return text(JSON.stringify(await api('/api/status'), null, 2));
  } catch (error) {
    return fail(error);
  }
});

await server.connect(new StdioServerTransport());
