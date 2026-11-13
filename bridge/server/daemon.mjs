#!/usr/bin/env node
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { HOST, getPort, loadOrCreateToken, tokenFile } from './config.mjs';
import { BridgeError, ExtensionLink } from './link.mjs';
import { handleChatCompletions, listModels } from './openai.mjs';

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

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
        const base = { extensionConnected: link.connected, hello: link.lastHello };
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
        const out = await link.ask({
          prompt: body.prompt,
          conversationId: body.conversation_id,
          model: body.model,
          thinking: body.thinking,
          search: body.search,
          signal: abort.signal,
        });
        return sendJson(res, 200, out);
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
    if (url.pathname !== '/ext' || !originOk || !supplied || !safeEqual(supplied, token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => link.attach(ws));
  });

  return { server, link, wss };
}

async function main() {
  const token = loadOrCreateToken();
  const port = getPort();
  const { server } = createBridge({ token });
  server.listen(port, HOST, () => {
    console.log(`DS bridge listening on http://${HOST}:${port}`);
    console.log(`  OpenAI-compatible base URL: http://${HOST}:${port}/v1   (api key = your bridge token)`);
    console.log(`  Token file: ${tokenFile()}`);
    console.log('  Paste the token and port into the browser extension options page.');
  });
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('daemon.mjs')) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
