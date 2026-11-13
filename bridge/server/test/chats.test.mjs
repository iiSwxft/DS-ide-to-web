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
const edits = [];
const turnActions = [];

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
  if (path === '/api/v0/chat/history_messages' && query.chat_session_id === '99999999-9999-4999-8999-999999999999') {
    const user = (id, parent, text) => ({ message_id: id, parent_id: parent, role: 'USER', fragments: [{ type: 'REQUEST', content: text }] });
    const bot = (id, parent, text) => ({ message_id: id, parent_id: parent, role: 'ASSISTANT', fragments: [{ type: 'RESPONSE', content: text }] });
    return envelope({
      chat_session: { id: query.chat_session_id, title: 'branchy', current_message_id: 6, updated_at: 1 },
      // 3/4 is the old branch left behind by an edit; 5/6 replaced it.
      chat_messages: [user(1, null, 'q1'), bot(2, 1, 'a1'), user(3, 2, 'old q'), bot(4, 3, 'old a'), user(5, 2, 'new q'), bot(6, 5, 'new a')],
    });
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
    } else if (msg.type === 'status') {
      ext.send(JSON.stringify({ id: msg.id, type: 'done', result: { ok: true, loggedIn: true } }));
    } else if (msg.type === 'regenerate' || msg.type === 'continue') {
      turnActions.push({ type: msg.type, ...msg.params });
      ext.send(JSON.stringify({ id: msg.id, type: 'done', result: { chatSessionId: msg.params.chatSessionId, responseMessageId: 777, text: `${msg.type}-ok`, reasoning: '' } }));
    } else if (msg.type === 'edit') {
      edits.push(msg.params);
      ext.send(JSON.stringify({ id: msg.id, type: 'done', result: { chatSessionId: msg.params.chatSessionId, responseMessageId: 555, text: 'edited-ok', reasoning: '' } }));
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

test('new chat gets the system instructions inside its first message', async () => {
  await (await call('/api/ask', { prompt: 'do the thing', system: 'You are a pirate.' })).json();
  const sent = asks.at(-1);
  assert.equal(sent.chatSessionId, null);
  assert.match(sent.prompt, /Instructions for this whole conversation/);
  assert.match(sent.prompt, /You are a pirate\./);
  assert.match(sent.prompt, /\[First message\]\ndo the thing$/);
});

test('named preset is applied; unknown preset is a 400', async () => {
  await (await call('/api/ask', { prompt: 'hi', preset: 'collaborator' })).json();
  assert.match(asks.at(-1).prompt, /another AI assistant/);
  const bad = await call('/api/ask', { prompt: 'hi', preset: 'nope' });
  assert.equal(bad.status, 400);
});

test('continuing a chat does NOT resend the system instructions', async () => {
  const first = await (await call('/api/ask', { prompt: 'start', system: 'Be formal.' })).json();
  await (await call('/api/ask', { prompt: 'next', conversation_id: first.conversationId, system: 'Be formal.' })).json();
  assert.equal(asks.at(-1).prompt, 'next');
  await (await call('/api/ask', { prompt: 'again', chat: A, system: 'Be formal.' })).json();
  assert.equal(asks.at(-1).prompt, 'again');
});

test('OpenAI endpoint: system message becomes chat instructions on a new chat', async () => {
  const res = await call('/v1/chat/completions', {
    model: 'deepseek-web',
    messages: [{ role: 'system', content: 'Answer in French.' }, { role: 'user', content: 'hello' }],
  });
  assert.equal(res.status, 200);
  const sent = asks.at(-1).prompt;
  assert.match(sent, /Answer in French\./);
  assert.match(sent, /\[First message\]\nhello$/);
});

test('OpenAI endpoint: continuing a chat sends only the newest user message', async () => {
  const first = await (await call('/v1/chat/completions', { messages: [{ role: 'user', content: 'one' }] })).json();
  await call('/v1/chat/completions', {
    conversation_id: first.conversation_id,
    messages: [
      { role: 'system', content: 'ignored on continue' },
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'two' },
    ],
  });
  assert.equal(asks.at(-1).prompt, 'two');
});

test('popup system prompt is the default for new chats, overridden by explicit system', async () => {
  ext.send(JSON.stringify({ type: 'settings', systemPrompt: 'POPUP PROMPT' }));
  await new Promise((r) => setTimeout(r, 50));
  const status = await (await call('/api/status')).json();
  assert.equal(status.systemPrompt.fromExtension, true);

  await (await call('/api/ask', { prompt: 'q1' })).json();
  assert.match(asks.at(-1).prompt, /POPUP PROMPT/);
  assert.match(asks.at(-1).prompt, /\[First message\]\nq1$/);

  await (await call('/api/ask', { prompt: 'q2', system: 'EXPLICIT' })).json();
  assert.match(asks.at(-1).prompt, /EXPLICIT/);
  assert.doesNotMatch(asks.at(-1).prompt, /POPUP PROMPT/);

  await (await call('/api/ask', { prompt: 'q3', preset: 'concise' })).json();
  assert.doesNotMatch(asks.at(-1).prompt, /POPUP PROMPT/);

  const first = await (await call('/api/ask', { prompt: 'q4' })).json();
  await (await call('/api/ask', { prompt: 'q5', conversation_id: first.conversationId })).json();
  assert.equal(asks.at(-1).prompt, 'q5', 'continuing a chat must not resend the popup prompt');

  ext.send(JSON.stringify({ type: 'settings', systemPrompt: '' }));
  await new Promise((r) => setTimeout(r, 50));
  await (await call('/api/ask', { prompt: 'q6' })).json();
  assert.equal(asks.at(-1).prompt, 'q6', 'clearing the popup prompt turns it off');
});

test('edit replaces your latest message by default and continues from the new answer', async () => {
  edits.length = 0;
  const out = await (await call('/api/edit', { chat: A, prompt: 'better question' })).json();
  assert.equal(out.text, 'edited-ok');
  assert.equal(out.editedMessageId, 1);
  assert.equal(out.previousText, 'hello');
  assert.deepEqual(edits.at(-1), { chatSessionId: A, messageId: 1, prompt: 'better question', thinking: false, search: false });
  // The conversation now continues from the edit's answer.
  await (await call('/api/ask', { prompt: 'follow up', conversation_id: A })).json();
  assert.equal(asks.at(-1).parentMessageId, 555);
});

test('edit validates the target message and the replacement text', async () => {
  let res = await call('/api/edit', { chat: A, prompt: 'x', message_id: 2 }); // 2 is the assistant message
  assert.equal(res.status, 404);
  assert.match((await res.json()).error.message, /editable ids: 1/);
  res = await call('/api/edit', { chat: A, prompt: '   ' });
  assert.equal(res.status, 400);
  res = await call('/api/edit', { prompt: 'x' });
  assert.equal(res.status, 400);
});

test('reading a chat shows only the live branch after an edit; all=1 shows every branch', async () => {
  const BR = '99999999-9999-4999-8999-999999999999';
  const live = await (await call(`/api/chat?chat=${BR}`)).json();
  assert.deepEqual(live.messages.map((m) => m.id), [1, 2, 5, 6]);
  const all = await (await call(`/api/chat?chat=${BR}&all=1`)).json();
  assert.deepEqual(all.messages.map((m) => m.id), [1, 2, 3, 4, 5, 6]);
});

test('director preset is available and applied to a new chat', async () => {
  await (await call('/api/ask', { prompt: 'GOAL: write a haiku', preset: 'director' })).json();
  const sent = asks.at(-1).prompt;
  assert.match(sent, /prompt director/);
  assert.match(sent, /NEXT PROMPT:/);
  assert.match(sent, /DONE:/);
  assert.match(sent, /\[First message\]\nGOAL: write a haiku$/);
});

test('regenerate redoes the latest DeepSeek answer by default and the chat continues from the new one', async () => {
  turnActions.length = 0;
  const out = await (await call('/api/regenerate', { chat: A })).json();
  assert.equal(out.text, 'regenerate-ok');
  assert.equal(out.regeneratedMessageId, 2);
  assert.equal(out.previousText, 'hi there');
  assert.deepEqual(turnActions.at(-1), { type: 'regenerate', chatSessionId: A, messageId: 2, thinking: false, search: false });
  await (await call('/api/ask', { prompt: 'thanks', conversation_id: A })).json();
  assert.equal(asks.at(-1).parentMessageId, 777);
});

test('regenerate can use thinking and rejects a message that is not a DeepSeek answer', async () => {
  await (await call('/api/regenerate', { chat: A, model: 'deepseek-web-thinking' })).json();
  assert.equal(turnActions.at(-1).thinking, true);
  const bad = await call('/api/regenerate', { chat: A, message_id: 1 }); // 1 is the user message
  assert.equal(bad.status, 404);
  assert.match((await bad.json()).error.message, /answer ids: 2/);
  assert.equal((await call('/api/regenerate', {})).status, 400);
});

test('continue extends the latest answer', async () => {
  const out = await (await call('/api/continue', { chat: A })).json();
  assert.equal(out.text, 'continue-ok');
  assert.equal(out.continuedMessageId, 2);
  assert.deepEqual(turnActions.at(-1), { type: 'continue', chatSessionId: A, messageId: 2 });
});
