import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createBridge } from '../daemon.mjs';

const TOKEN = 'test-token';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

let bridge;
let port;
let ext;
let chats;
let asks;
const deleted = [];

const envelope = (biz_data, biz_code = 0) => ({ status: 200, json: { data: { biz_code, biz_msg: biz_code ? 'nope' : '', biz_data } } });

function handleApi({ path, query = {}, json = {} }) {
  if (path === '/api/v0/chat_session/fetch_page') {
    const cursor = query['lte_cursor.updated_at'];
    const sorted = [...chats].sort((x, y) => y.updated_at - x.updated_at);
    const start = cursor === undefined ? 0 : sorted.findIndex((c) => c.updated_at === Number(cursor));
    const page = sorted.slice(Math.max(start, 0), Math.max(start, 0) + Number(query.count));
    const hasMore = Math.max(start, 0) + page.length < sorted.length;
    return envelope({ chat_sessions: page, has_more: hasMore });
  }
  if (path === '/api/v0/chat/history_messages') {
    const chat = chats.find((c) => c.id === query.chat_session_id);
    if (!chat) return envelope({}, 1004);
    return envelope({
      chat_session: { ...chat, current_message_id: 2 },
      chat_messages: [
        { message_id: 1, parent_id: null, role: 'USER', fragments: [{ type: 'REQUEST', content: 'hello' }] },
        { message_id: 2, parent_id: 1, role: 'ASSISTANT', fragments: [{ type: 'THINK', content: 'hmm' }, { type: 'RESPONSE', content: 'hi there' }] },
      ],
    });
  }
  if (path === '/api/v0/chat_session/update_title') {
    chats.find((c) => c.id === json.chat_session_id).title = json.title;
    return envelope({ title: json.title });
  }
  if (path === '/api/v0/chat_session/batch_update_pinned') {
    for (const id of json.chat_session_ids) chats.find((c) => c.id === id).pinned = json.pinned;
    return envelope({ illegal_chat_session_ids: [] });
  }
  if (path === '/api/v0/chat_session/delete') {
    for (const id of json.chat_session_ids) {
      deleted.push(id);
      chats = chats.filter((c) => c.id !== id);
    }
    return envelope({});
  }
  return { status: 404, json: null };
}

before(async () => {
  chats = [
    { id: A, title: 'Trip planning', pinned: false, updated_at: 300 },
    { id: B, title: 'Trip budget', pinned: false, updated_at: 200 },
    { id: C, title: 'Recipes', pinned: false, updated_at: 100 },
  ];
  asks = [];
  bridge = createBridge({ token: TOKEN });
  await new Promise((r) => bridge.server.listen(0, '127.0.0.1', r));
  port = bridge.server.address().port;
  ext = new WebSocket(`ws://127.0.0.1:${port}/ext?token=${TOKEN}`, { origin: 'chrome-extension://abc' });
  await new Promise((resolve, reject) => { ext.on('open', resolve); ext.on('error', reject); });
  ext.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === 'api') {
      ext.send(JSON.stringify({ id: msg.id, type: 'done', result: handleApi(msg.params) }));
    } else if (msg.type === 'ask') {
      asks.push(msg.params);
      ext.send(JSON.stringify({
        id: msg.id,
        type: 'done',
        result: { chatSessionId: msg.params.chatSessionId ?? 'new-session', responseMessageId: 99, text: 'ok', reasoning: '' },
      }));
    }
  });
  await new Promise((r) => setTimeout(r, 50));
});

after(() => { ext.close(); bridge.server.close(); });

const call = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
  method: body ? 'POST' : 'GET',
  headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});

test('lists chats and filters by title', async () => {
  const all = await (await call('/api/chats')).json();
  assert.deepEqual(all.chats.map((c) => c.title), ['Trip planning', 'Trip budget', 'Recipes']);
  const trips = await (await call('/api/chats?q=trip')).json();
  assert.equal(trips.chats.length, 2);
});

test('lists across pages without duplicates', async () => {
  chats.push(...Array.from({ length: 60 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, title: `bulk ${i}`, pinned: false, updated_at: 1000 + i })));
  const res = await (await call('/api/chats?limit=200')).json();
  assert.equal(res.chats.length, 63);
  assert.equal(new Set(res.chats.map((c) => c.id)).size, 63);
  chats = chats.filter((c) => !c.title.startsWith('bulk'));
});

test('reads a chat by title with reasoning optional', async () => {
  const plain = await (await call('/api/chat?chat=Recipes')).json();
  assert.equal(plain.messages[1].text, 'hi there');
  assert.equal(plain.messages[1].reasoning, undefined);
  const withThinking = await (await call('/api/chat?chat=Recipes&reasoning=1')).json();
  assert.equal(withThinking.messages[1].reasoning, 'hmm');
});

test('ambiguous and unknown titles give clear errors', async () => {
  let res = await call('/api/chat?chat=Trip');
  assert.equal(res.status, 409);
  assert.match((await res.json()).error.message, /matches 2 chats/);
  res = await call('/api/chat?chat=zzz-nothing');
  assert.equal(res.status, 404);
});

test('ask continues an existing chat by title, replying to its last message', async () => {
  const out = await (await call('/api/ask', { prompt: 'more', chat: 'Recipes' })).json();
  assert.equal(out.text, 'ok');
  const last = asks.at(-1);
  assert.equal(last.chatSessionId, C);
  assert.equal(last.parentMessageId, 2);
});

test('rename and pin', async () => {
  const renamed = await (await call('/api/chat/rename', { chat: C, title: 'Dinner ideas' })).json();
  assert.equal(renamed.title, 'Dinner ideas');
  assert.equal(chats.find((c) => c.id === C).title, 'Dinner ideas');
  await call('/api/chat/pin', { chat: 'Dinner ideas', pinned: true });
  assert.equal(chats.find((c) => c.id === C).pinned, true);
});

test('delete requires explicit confirmation', async () => {
  const res = await call('/api/chat/delete', { chats: [C] });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'confirmation_required');
  assert.equal(deleted.length, 0);
});

test('delete resolves every target first and refuses if any is ambiguous', async () => {
  const res = await call('/api/chat/delete', { chats: [C, 'Trip'], confirm: true });
  assert.equal(res.status, 409);
  assert.equal(deleted.length, 0, 'nothing may be deleted when one target is ambiguous');
});

test('delete with confirm removes the chat', async () => {
  const out = await (await call('/api/chat/delete', { chats: [C], confirm: true })).json();
  assert.deepEqual(out.deleted.map((d) => d.id), [C]);
  assert.deepEqual(deleted, [C]);
});

test('DeepSeek refusal surfaces as an error', async () => {
  const res = await call('/api/chat?chat=44444444-4444-4444-8444-444444444444');
  assert.equal(res.status, 502);
  assert.match((await res.json()).error.message, /code 1004/);
});
