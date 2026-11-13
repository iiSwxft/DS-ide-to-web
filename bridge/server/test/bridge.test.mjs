import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createBridge } from '../daemon.mjs';
import { messagesToPrompt } from '../openai.mjs';

const TOKEN = 'test-token';
let bridge;
let port;
let ext;
const seenAsks = [];

before(async () => {
  bridge = createBridge({ token: TOKEN });
  await new Promise((r) => bridge.server.listen(0, '127.0.0.1', r));
  port = bridge.server.address().port;

  // Fake browser extension.
  ext = new WebSocket(`ws://127.0.0.1:${port}/ext?token=${TOKEN}`, { origin: 'chrome-extension://abc' });
  await new Promise((resolve, reject) => { ext.on('open', resolve); ext.on('error', reject); });
  ext.send(JSON.stringify({ type: 'hello', version: 'test' }));
  ext.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === 'status') {
      ext.send(JSON.stringify({ id: msg.id, type: 'done', result: { ok: true, loggedIn: true } }));
    } else if (msg.type === 'ask') {
      seenAsks.push(msg.params);
      ext.send(JSON.stringify({ id: msg.id, type: 'delta', reasoning: 'hmm ' }));
      ext.send(JSON.stringify({ id: msg.id, type: 'delta', text: 'Hel' }));
      ext.send(JSON.stringify({ id: msg.id, type: 'delta', text: 'lo' }));
      ext.send(JSON.stringify({
        id: msg.id,
        type: 'done',
        result: { chatSessionId: 'sess-1', responseMessageId: 7 + seenAsks.length, text: 'Hello', reasoning: 'hmm ' },
      }));
    }
  });
  await new Promise((r) => setTimeout(r, 50));
});

after(() => { ext.close(); bridge.server.close(); });

const call = (path, init = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
  ...init,
  headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...init.headers },
});

test('rejects missing token', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/v1/models`);
  assert.equal(res.status, 401);
});

test('rejects browser-origin HTTP requests', async () => {
  const res = await call('/v1/models', { headers: { origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
});

test('rejects websocket from a web page origin or bad token', async () => {
  for (const [url, origin] of [
    [`ws://127.0.0.1:${port}/ext?token=${TOKEN}`, 'https://evil.example'],
    [`ws://127.0.0.1:${port}/ext?token=wrong`, 'chrome-extension://abc'],
  ]) {
    await new Promise((resolve) => {
      const ws = new WebSocket(url, { origin });
      ws.on('error', resolve);
      ws.on('unexpected-response', resolve);
      ws.on('open', () => { ws.close(); assert.fail('should not connect'); });
    });
  }
});

test('status reflects the extension', async () => {
  const body = await (await call('/api/status')).json();
  assert.equal(body.extensionConnected, true);
  assert.equal(body.loggedIn, true);
});

test('non-streaming chat completion', async () => {
  const res = await call('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'deepseek-web-thinking', messages: [{ role: 'user', content: 'hi' }] }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.choices[0].message.content, 'Hello');
  assert.equal(body.choices[0].message.reasoning_content, 'hmm ');
  assert.ok(body.conversation_id);
  const last = seenAsks.at(-1);
  assert.equal(last.prompt, 'hi');
  assert.equal(last.thinking, true);
  assert.equal(last.chatSessionId, null);
});

test('streaming chat completion emits OpenAI chunks and [DONE]', async () => {
  const res = await call('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'hi' }] }),
  });
  const text = await res.text();
  assert.match(text, /"content":"Hel"/);
  assert.match(text, /"content":"lo"/);
  assert.match(text, /"finish_reason":"stop"/);
  assert.ok(text.trim().endsWith('data: [DONE]'));
});

test('conversation_id continues the same DeepSeek chat', async () => {
  const first = await (await call('/api/ask', { method: 'POST', body: JSON.stringify({ prompt: 'one' }) })).json();
  const second = await (await call('/api/ask', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'two', conversation_id: first.conversationId }),
  })).json();
  assert.equal(second.conversationId, first.conversationId);
  const last = seenAsks.at(-1);
  assert.equal(last.chatSessionId, 'sess-1');
  assert.equal(last.parentMessageId, 7 + seenAsks.length - 1);
});

test('unknown conversation and model give clear errors', async () => {
  let res = await call('/api/ask', { method: 'POST', body: JSON.stringify({ prompt: 'x', conversation_id: 'nope' }) });
  assert.equal(res.status, 404);
  res = await call('/api/ask', { method: 'POST', body: JSON.stringify({ prompt: 'x', model: 'gpt-9' }) });
  assert.equal(res.status, 400);
});

test('503 when no extension is connected', async () => {
  const lonely = createBridge({ token: TOKEN });
  await new Promise((r) => lonely.server.listen(0, '127.0.0.1', r));
  const p = lonely.server.address().port;
  const res = await fetch(`http://127.0.0.1:${p}/api/ask`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'x' }),
  });
  assert.equal(res.status, 503);
  lonely.server.close();
});

test('messagesToPrompt flattens multi-turn history', () => {
  assert.equal(messagesToPrompt([{ role: 'user', content: 'a' }]), 'a');
  const flat = messagesToPrompt([
    { role: 'system', content: 'be brief' },
    { role: 'user', content: [{ type: 'text', text: 'q' }] },
  ]);
  assert.match(flat, /System: be brief/);
  assert.match(flat, /User: q/);
  assert.ok(flat.endsWith('Assistant:'));
  assert.throws(() => messagesToPrompt([]));
});
