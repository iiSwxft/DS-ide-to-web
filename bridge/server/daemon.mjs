#!/usr/bin/env node
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { DEFAULT_TOKEN, HOST, getPort, loadToken, tokenFile } from './config.mjs';
import { BridgeError, ExtensionLink } from './link.mjs';
import { handleChatCompletions, listModels } from './openai.mjs';
import { askFlow, deleteChats, editMessage, listChats, pinChat, readChat, renameChat, resolveChat } from './chats.mjs';

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const HOST_RE = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BridgeError('Request body too large.', 'payload_too_large', 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new BridgeError('Invalid JSON body.', 'invalid_json', 400)); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function sendError(res, error) {
  const status = error.status ?? 500;
  sendJson(res, status, { error: { message: error.message, code: error.code ?? 'internal_error' } });
}

export function createBridge({ token, link = new ExtensionLink() } = {}) {
  const server = createServer(async (req, res) => {
    try {
      // Browsers must not be able to drive the bridge from a web page.
      if (req.headers.origin) {
        throw new BridgeError('Browser-origin requests are not allowed.', 'forbidden_origin', 403);
      }
      if (!HOST_RE.test(req.headers.host ?? '')) {
        throw new BridgeError('Unexpected Host header.', 'forbidden_host', 403);
      }
      const auth = req.headers.authorization ?? '';
      const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!supplied || !safeEqual(supplied, token)) {
        throw new BridgeError('Missing or invalid bearer token.', 'unauthorized', 401);
      }

      const url = new URL(req.url, `http://${HOST}`);
      const abort = new AbortController();
      res.on('close', () => { if (!res.writableEnded) abort.abort(); });

      if (req.method === 'GET' && url.pathname === '/v1/models') return sendJson(res, 200, listModels());
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const base = {
          extensionConnected: link.connected,
          hello: link.lastHello,
          systemPrompt: { fromExtension: link.extensionSystem.length > 0, chars: link.extensionSystem.length },
        };
        if (!link.connected) return sendJson(res, 200, base);
        try { return sendJson(res, 200, { ...base, ...(await link.status()) }); }
        catch (error) { return sendJson(res, 200, { ...base, error: error.message }); }
      }
      if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
        return await handleChatCompletions(link, await readJson(req), res, abort.signal);
      }
      if (req.method === 'POST' && url.pathname === '/api/ask') {
        const body = await readJson(req);
        if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
          throw new BridgeError('"prompt" must be a non-empty string.', 'invalid_request', 400);
        }
        return sendJson(res, 200, await askFlow(link, body, { signal: abort.signal }));
      }
      if (req.method === 'POST' && url.pathname === '/api/edit') {
        return sendJson(res, 200, await editMessage(link, await readJson(req), { signal: abort.signal }));
      }
      if (req.method === 'GET' && url.pathname === '/api/chats') {
        const chats = await listChats(link, { limit: url.searchParams.get('limit') ?? 30, query: url.searchParams.get('q') ?? undefined });
        return sendJson(res, 200, { chats });
      }
      if (req.method === 'GET' && url.pathname === '/api/chat') {
        const chat = await resolveChat(link, url.searchParams.get('chat'));
        return sendJson(res, 200, await readChat(link, chat.id, { includeReasoning: url.searchParams.get('reasoning') === '1' }));
      }
      if (req.method === 'POST' && url.pathname === '/api/chat/rename') {
        const body = await readJson(req);
        return sendJson(res, 200, await renameChat(link, body.chat, body.title));
      }
      if (req.method === 'POST' && url.pathname === '/api/chat/pin') {
        const body = await readJson(req);
        return sendJson(res, 200, await pinChat(link, body.chat, body.pinned !== false));
      }
      if (req.method === 'POST' && url.pathname === '/api/chat/delete') {
        const body = await readJson(req);
        return sendJson(res, 200, await deleteChats(link, body.chats ?? body.chat, { confirm: body.confirm }));
      }
      throw new BridgeError('Not found.', 'not_found', 404);
    } catch (error) {
      if (!(error instanceof BridgeError)) console.error('[bridge]', error);
      if (res.headersSent) { res.end(); return; }
      sendError(res, error instanceof BridgeError ? error : new BridgeError(error.message, 'internal_error', 500));
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${HOST}`);
    const origin = req.headers.origin ?? '';
    const supplied = url.searchParams.get('token') ?? '';
    // Only a browser extension may connect: web pages carry an http(s) origin.
    const originOk = /^(chrome|moz)-extension:\/\//.test(origin);
    let reason = null;
    if (!HOST_RE.test(req.headers.host ?? '')) reason = `bad Host header "${req.headers.host}"`;
    else if (url.pathname !== '/ext') reason = `bad path "${url.pathname}"`;
    else if (!originOk) reason = `origin "${origin}" is not a browser extension`;
    else if (!supplied || !safeEqual(supplied, token)) reason = 'wrong key (set the same key in the extension popup, Advanced, or Reset to defaults)';
    if (reason) {
      console.warn(`[bridge] rejected extension connection: ${reason}`);
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log(`[bridge] extension connected (${origin})`);
      link.attach(ws);
    });
  });

  return { server, link, wss };
}

async function main() {
  const token = loadToken();
  const port = getPort();
  const { server } = createBridge({ token });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') console.error(`Port ${port} is already in use. Is the bridge already running? Set DS_BRIDGE_PORT to change it.`);
    else console.error(error);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    console.log(`DeepSeek Bridge running on http://${HOST}:${port}`);
    console.log(`  OpenAI base URL: http://${HOST}:${port}/v1`);
    console.log(token === DEFAULT_TOKEN
      ? `  API key: ${DEFAULT_TOKEN}  (default; the extension uses it automatically)`
      : `  API key: custom token in use (${process.env.DS_BRIDGE_TOKEN ? 'DS_BRIDGE_TOKEN' : tokenFile()}); set the same value in the extension's Advanced settings`);
    console.log('  Open chat.deepseek.com in a logged-in browser with the extension installed.');
  });
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('daemon.mjs')) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
