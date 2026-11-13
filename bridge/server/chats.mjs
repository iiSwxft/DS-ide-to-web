import { BridgeError } from './link.mjs';
import { pickSystem, withSystem } from './presets.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROUTES = {
  list: '/api/v0/chat_session/fetch_page',
  history: '/api/v0/chat/history_messages',
  rename: '/api/v0/chat_session/update_title',
  remove: '/api/v0/chat_session/delete',
  pin: '/api/v0/chat_session/batch_update_pinned',
};

/** Run an allowlisted call and unwrap DeepSeek's { data: { biz_code, biz_msg, biz_data } } envelope. */
async function call(link, path, opts) {
  const { status, json } = await link.api(path, opts);
  const data = json?.data;
  if (status >= 400 || !data) {
    throw new BridgeError(`DeepSeek returned HTTP ${status} for ${path}.`, 'deepseek_http_error', 502);
  }
  if (data.biz_code !== 0) {
    throw new BridgeError(`DeepSeek refused the request (code ${data.biz_code}): ${data.biz_msg || 'no message'}`, 'deepseek_refused', 502);
  }
  return data.biz_data ?? {};
}

const toChat = (s) => ({
  id: s.id,
  title: s.title ?? '',
  pinned: Boolean(s.pinned),
  updatedAt: s.updated_at ? new Date(s.updated_at * 1000).toISOString() : null,
  modelType: s.model_type ?? null,
});

/** List chats, newest first (pinned first, as the site does). Pages with the site's own cursor. */
export async function listChats(link, { limit = 30, query } = {}) {
  const wanted = Math.max(1, Math.min(Number(limit) || 30, 500));
  const out = [];
  const seen = new Set();
  let cursor = null;
  for (let page = 0; page < 40 && out.length < wanted; page += 1) {
    const q = { count: Math.min(50, wanted) };
    if (cursor) {
      q['lte_cursor.pinned'] = cursor.pinned;
      q['lte_cursor.updated_at'] = cursor.updated_at;
    }
    const data = await call(link, ROUTES.list, { query: q });
    const sessions = data.chat_sessions ?? [];
    let added = 0;
    for (const s of sessions) {
      if (seen.has(s.id)) continue; // the lte cursor repeats its boundary item
      seen.add(s.id);
      out.push(s);
      added += 1;
    }
    if (!data.has_more || sessions.length === 0 || added === 0) break;
    const last = sessions[sessions.length - 1];
    cursor = { pinned: Boolean(last.pinned), updated_at: last.updated_at };
  }
  let chats = out.map(toChat);
  if (query) {
    const needle = String(query).toLowerCase();
    chats = chats.filter((c) => c.title.toLowerCase().includes(needle));
  }
  return chats.slice(0, wanted);
}

function fragmentText(message, types) {
  return (message.fragments ?? [])
    .filter((f) => types.includes(String(f.type).toUpperCase()))
    .map((f) => f.content ?? '')
    .join('');
}

/** Keep only the messages on the path from the root to the current message (follows parent links). */
function activeBranch(messages, currentId) {
  if (currentId === null || currentId === undefined) return messages;
  const byId = new Map(messages.map((m) => [m.id, m]));
  if (!byId.has(currentId)) return messages;
  const keep = new Set();
  for (let id = currentId; id !== null && id !== undefined && byId.has(id) && !keep.has(id); id = byId.get(id).parentId) {
    keep.add(id);
  }
  return messages.filter((m) => keep.has(m.id));
}

/** Read a chat by id: session info plus ordered messages (live branch unless allBranches). */
export async function readChat(link, id, { includeReasoning = false, allBranches = false } = {}) {
  const data = await call(link, ROUTES.history, { query: { chat_session_id: id } });
  const messages = (data.chat_messages ?? []).map((m) => {
    const role = String(m.role).toLowerCase();
    const msg = {
      id: m.message_id,
      parentId: m.parent_id ?? null,
      role,
      text: fragmentText(m, role === 'user' ? ['REQUEST'] : ['RESPONSE']),
    };
    if (includeReasoning && role === 'assistant') msg.reasoning = fragmentText(m, ['THINK']);
    return msg;
  });
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const currentMessageId = data.chat_session?.current_message_id ?? lastAssistant?.id ?? null;
  return {
    chat: data.chat_session ? toChat(data.chat_session) : { id },
    currentMessageId,
    // Editing a message leaves the old answers behind as another branch; show only the live conversation.
    messages: allBranches ? messages : activeBranch(messages, currentMessageId),
  };
}

/** Resolve a chat reference (id, exact title, or unique partial title) to a chat. */
export async function resolveChat(link, ref) {
  const text = String(ref ?? '').trim();
  if (!text) throw new BridgeError('A chat id or title is required.', 'invalid_request', 400);
  if (UUID.test(text)) return { id: text };
  const chats = await listChats(link, { limit: 500 });
  const lower = text.toLowerCase();
  const exact = chats.filter((c) => c.title.toLowerCase() === lower);
  if (exact.length === 1) return exact[0];
  const pool = exact.length > 1 ? exact : chats.filter((c) => c.title.toLowerCase().includes(lower));
  if (pool.length === 1) return pool[0];
  if (pool.length === 0) throw new BridgeError(`No chat found matching "${text}".`, 'chat_not_found', 404);
  const sample = pool.slice(0, 5).map((c) => `"${c.title}" (${c.id})`).join(', ');
  throw new BridgeError(`"${text}" matches ${pool.length} chats: ${sample}. Use the chat id to be specific.`, 'chat_ambiguous', 409);
}

export async function renameChat(link, ref, title) {
  const name = String(title ?? '').trim();
  if (!name) throw new BridgeError('"title" must be a non-empty string.', 'invalid_request', 400);
  const chat = await resolveChat(link, ref);
  const data = await call(link, ROUTES.rename, { json: { chat_session_id: chat.id, title: name } });
  return { id: chat.id, title: data.title ?? name };
}

export async function pinChat(link, ref, pinned = true) {
  const chat = await resolveChat(link, ref);
  await call(link, ROUTES.pin, { json: { chat_session_ids: [chat.id], pinned: Boolean(pinned) } });
  return { id: chat.id, pinned: Boolean(pinned) };
}

/** Delete one or more chats. Callers must have obtained explicit confirmation first. */
export async function deleteChats(link, refs, { confirm } = {}) {
  if (confirm !== true) {
    throw new BridgeError('Deleting is permanent. Pass confirm: true to proceed.', 'confirmation_required', 400);
  }
  const list = (Array.isArray(refs) ? refs : [refs]).filter(Boolean);
  if (list.length === 0) throw new BridgeError('No chats given to delete.', 'invalid_request', 400);
  if (list.length > 20) throw new BridgeError('Refusing to delete more than 20 chats in one call.', 'too_many', 400);
  const resolved = [];
  for (const ref of list) resolved.push(await resolveChat(link, ref)); // resolves everything before deleting anything
  await call(link, ROUTES.remove, { json: { chat_session_ids: resolved.map((c) => c.id) } });
  return { deleted: resolved.map((c) => ({ id: c.id, title: c.title ?? null })) };
}

/**
 * Prepare to continue an existing chat: returns the conversation record the
 * link uses (session id plus the message the next prompt should reply to).
 */
export async function openChat(link, ref) {
  const chat = await resolveChat(link, ref);
  const history = await readChat(link, chat.id);
  return {
    chatSessionId: chat.id,
    parentMessageId: history.currentMessageId,
    title: history.chat.title ?? chat.title ?? '',
  };
}

/**
 * One prompt, with optional chat targeting:
 *   body.chat            continue an existing DeepSeek chat (id, title or part of a title)
 *   body.conversation_id continue a chat this bridge already talked in
 *   body.new_chat_title  name a newly created chat
 * Everything else (model, thinking, search) passes through to the link.
 */
export async function askFlow(link, body, extra = {}) {
  let conversationId = body.conversation_id;
  if (body.chat) {
    const opened = await openChat(link, body.chat);
    conversationId = opened.chatSessionId;
    link.conversations.set(conversationId, {
      chatSessionId: opened.chatSessionId,
      parentMessageId: opened.parentMessageId,
    });
  }
  const isNew = !conversationId;
  let prompt = body.prompt;
  if (isNew) {
    // Only a brand-new chat gets instructions; continuing chats already have them.
    try {
      prompt = withSystem(
        pickSystem({ system: body.system, preset: body.preset, extensionSystem: link.extensionSystem }),
        prompt,
      );
    } catch (error) {
      throw new BridgeError(error.message, 'invalid_request', 400);
    }
  }
  const out = await link.ask({
    prompt,
    conversationId,
    model: body.model,
    thinking: body.thinking,
    search: body.search,
    ...extra,
  });
  if (isNew && body.new_chat_title) {
    const sessionId = link.conversations.get(out.conversationId)?.chatSessionId;
    if (sessionId) {
      try { await renameChat(link, sessionId, body.new_chat_title); out.title = String(body.new_chat_title); }
      catch (error) { out.titleError = error.message; }
    }
  }
  return out;
}

/**
 * Edit one of your earlier messages in a chat and get DeepSeek's answer to the new text.
 *   body.chat | body.conversation_id   which chat (id, title, or a conversation id from deepseek_ask)
 *   body.message_id                    which USER message to replace (default: your latest message)
 *   body.prompt                        the replacement text
 * Messages after the edited one are no longer part of the active branch (the site keeps them as an
 * older version), so the chat continues from the new answer.
 */
export async function editMessage(link, body, extra = {}) {
  const newText = String(body.prompt ?? '').trim();
  if (!newText) throw new BridgeError('"prompt" (the replacement text) must be a non-empty string.', 'invalid_request', 400);

  const sessionId = await sessionIdFor(link, body, 'edit');

  const history = await readChat(link, sessionId);
  const userMessages = history.messages.filter((m) => m.role === 'user');
  if (userMessages.length === 0) throw new BridgeError('That chat has no user messages to edit.', 'invalid_request', 400);

  let target;
  if (body.message_id !== undefined && body.message_id !== null) {
    target = userMessages.find((m) => m.id === Number(body.message_id));
    if (!target) {
      const ids = userMessages.map((m) => m.id).join(', ');
      throw new BridgeError(`Message ${body.message_id} is not one of your messages in this chat (editable ids: ${ids}).`, 'message_not_found', 404);
    }
  } else {
    target = userMessages[userMessages.length - 1];
  }

  const out = await link.edit({
    chatSessionId: sessionId,
    messageId: target.id,
    prompt: newText,
    model: body.model,
    thinking: body.thinking,
    search: body.search,
    ...extra,
  });
  return { ...out, editedMessageId: target.id, previousText: target.text };
}

/** Which chat does this request mean? A conversation id from deepseek_ask, or a chat id/title. */
async function sessionIdFor(link, body, verb) {
  if (body.conversation_id && link.conversations.has(body.conversation_id)) {
    return link.conversations.get(body.conversation_id).chatSessionId;
  }
  if (body.chat || body.conversation_id) {
    return (await resolveChat(link, body.chat ?? body.conversation_id)).id;
  }
  throw new BridgeError(`Say which chat to ${verb}: pass "chat" (id or title) or "conversation_id".`, 'invalid_request', 400);
}

/** Pick the assistant message an action applies to: the given message_id, or the latest answer. */
async function targetAssistantMessage(link, body, verb) {
  const sessionId = await sessionIdFor(link, body, verb);
  const history = await readChat(link, sessionId);
  const answers = history.messages.filter((m) => m.role === 'assistant');
  if (answers.length === 0) throw new BridgeError('That chat has no answer from DeepSeek yet.', 'invalid_request', 400);
  let target = answers[answers.length - 1];
  if (body.message_id !== undefined && body.message_id !== null) {
    target = answers.find((m) => m.id === Number(body.message_id));
    if (!target) {
      throw new BridgeError(
        `Message ${body.message_id} is not a DeepSeek answer in this chat (answer ids: ${answers.map((m) => m.id).join(', ')}).`,
        'message_not_found',
        404,
      );
    }
  }
  return { sessionId, target };
}

/**
 * Generate DeepSeek's answer again (like the site's regenerate button).
 *   body.chat | body.conversation_id   which chat
 *   body.message_id                    which DeepSeek answer to redo (default: the latest)
 * The old answer stays on the site as an older version; the chat continues from the new one.
 */
export async function regenerateAnswer(link, body, extra = {}) {
  const { sessionId, target } = await targetAssistantMessage(link, body, 'regenerate in');
  const out = await link.regenerate({
    chatSessionId: sessionId,
    messageId: target.id,
    model: body.model,
    thinking: body.thinking,
    search: body.search,
    ...extra,
  });
  return { ...out, regeneratedMessageId: target.id, previousText: target.text };
}

/**
 * Continue an answer that was cut off (like the site's continue button).
 * Works on the latest answer unless body.message_id says otherwise.
 */
export async function continueAnswer(link, body, extra = {}) {
  const { sessionId, target } = await targetAssistantMessage(link, body, 'continue');
  const out = await link.continueAnswer({ chatSessionId: sessionId, messageId: target.id, ...extra });
  return { ...out, continuedMessageId: target.id };
}
