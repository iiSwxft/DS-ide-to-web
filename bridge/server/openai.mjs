import { randomUUID } from 'node:crypto';
import { BridgeError, MODELS } from './link.mjs';
import { askFlow } from './chats.mjs';

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * The web app is a stateful chat, OpenAI clients are stateless. A lone user
 * message is sent as-is; a longer history is flattened into a transcript so
 * the model sees the whole conversation in one prompt.
 */
export function messagesToPrompt(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new BridgeError('"messages" must be a non-empty array.', 'invalid_request', 400);
  }
  const turns = messages
    .map((m) => ({ role: String(m?.role ?? 'user'), text: contentToText(m?.content).trim() }))
    .filter((m) => m.text);
  if (turns.length === 0) throw new BridgeError('No text content in "messages".', 'invalid_request', 400);
  if (turns.length === 1 && turns[0].role === 'user') return turns[0].text;

  const label = { system: 'System', user: 'User', assistant: 'Assistant', tool: 'Tool' };
  const lines = turns.map((m) => `${label[m.role] ?? m.role}: ${m.text}`);
  return `${lines.join('\n\n')}\n\nAssistant:`;
}

export function listModels() {
  return {
    object: 'list',
    data: Object.keys(MODELS).map((id) => ({ id, object: 'model', created: 0, owned_by: 'deepseek-web' })),
  };
}

function chunk(id, model, delta, finish = null) {
  return `data: ${JSON.stringify({
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
}

/** POST /v1/chat/completions */
export async function handleChatCompletions(link, body, res, abortSignal) {
  const model = body.model || 'deepseek-web';
  const prompt = messagesToPrompt(body.messages);
  const common = {
    prompt,
    conversation_id: body.conversation_id,
    chat: body.chat,
    new_chat_title: body.new_chat_title,
    model,
    thinking: typeof body.ds_thinking === 'boolean' ? body.ds_thinking : undefined,
    search: body.ds_search,
  };
  const id = `chatcmpl-${randomUUID()}`;

  if (!body.stream) {
    const out = await askFlow(link, common, { signal: abortSignal });
    const message = { role: 'assistant', content: out.text };
    if (out.reasoning) message.reasoning_content = out.reasoning;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      conversation_id: out.conversationId,
      choices: [{ index: 0, message, finish_reason: 'stop' }],
      usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
    }));
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write(chunk(id, model, { role: 'assistant' }));
  try {
    const out = await askFlow(link, common, {
      signal: abortSignal,
      onDelta: ({ text, reasoning }) => {
        if (reasoning) res.write(chunk(id, model, { reasoning_content: reasoning }));
        if (text) res.write(chunk(id, model, { content: text }));
      },
    });
    res.write(chunk(id, model, {}, 'stop'));
    res.write(`data: ${JSON.stringify({ conversation_id: out.conversationId })}\n\n`);
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: { message: error.message, code: error.code ?? 'bridge_error' } })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}
