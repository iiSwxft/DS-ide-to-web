import { randomUUID } from 'node:crypto';

/**
 * Model aliases exposed to clients. DeepSeek's web app has a model type
 * ("default" | "expert") and a separate "thinking" toggle.
 */
export const MODELS = {
  'deepseek-web': { modelType: 'default', thinking: false },
  'deepseek-web-thinking': { modelType: 'default', thinking: true },
  'deepseek-web-expert': { modelType: 'expert', thinking: true },
};

export function resolveModel(name) {
  if (!name) return MODELS['deepseek-web'];
  return MODELS[name] ?? null;
}

export class BridgeError extends Error {
  constructor(message, code = 'bridge_error', status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Holds the single WebSocket the browser extension keeps open, correlates
 * requests with responses, and remembers conversations (chat session + the
 * last assistant message id) so callers can continue a chat by id.
 */
export class ExtensionLink {
  constructor({ requestTimeoutMs = 10 * 60 * 1000 } = {}) {
    this.socket = null;
    this.pending = new Map();
    this.conversations = new Map();
    this.requestTimeoutMs = requestTimeoutMs;
    this.lastHello = null;
  }

  get connected() {
    return Boolean(this.socket && this.socket.readyState === 1);
  }

  attach(socket) {
    if (this.socket && this.socket !== socket) {
      try { this.socket.close(4000, 'replaced by a newer extension connection'); } catch { /* already closed */ }
    }
    this.socket = socket;
    socket.on('message', (raw) => this.#onMessage(raw));
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
      this.#failAll(new BridgeError('Browser extension disconnected.', 'extension_disconnected'));
    });
    socket.on('error', () => { /* close handler fails pending requests */ });
  }

  #failAll(error) {
    for (const entry of this.pending.values()) entry.fail(error);
    this.pending.clear();
  }

  #onMessage(raw) {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') {
      this.lastHello = { version: msg.version ?? null, at: Date.now() };
      return;
    }
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    if (msg.type === 'delta') {
      entry.onDelta?.({ text: msg.text ?? '', reasoning: msg.reasoning ?? '' });
    } else if (msg.type === 'done' || msg.type === 'status') {
      this.pending.delete(msg.id);
      entry.succeed(msg.result ?? msg);
    } else if (msg.type === 'error') {
      this.pending.delete(msg.id);
      entry.fail(new BridgeError(msg.message || 'Extension reported an error.', msg.code || 'extension_error'));
    }
  }

  #send(type, params, { onDelta, signal } = {}) {
    if (!this.connected) {
      return Promise.reject(new BridgeError(
        'No browser extension is connected. Open chat.deepseek.com in a logged-in browser with the DS bridge extension installed and its token configured.',
        'extension_not_connected',
        503,
      ));
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.socket?.send(JSON.stringify({ id, type: 'cancel' }));
        reject(new BridgeError('Timed out waiting for DeepSeek.', 'timeout', 504));
      }, this.requestTimeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        if (!this.pending.delete(id)) return;
        cleanup();
        try { this.socket?.send(JSON.stringify({ id, type: 'cancel' })); } catch { /* socket gone */ }
        reject(new BridgeError('Request cancelled.', 'cancelled', 499));
      };
      this.pending.set(id, {
        onDelta,
        succeed: (value) => { cleanup(); resolve(value); },
        fail: (error) => { cleanup(); reject(error); },
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      this.socket.send(JSON.stringify({ id, type, params }));
    });
  }

  status() {
    return this.#send('status', {});
  }

  /** Low-level, allowlisted DeepSeek chat-management call (the extension enforces the allowlist). */
  async api(path, { query, json, signal } = {}) {
    const out = await this.#send('api', { path, query, json }, { signal });
    return out; // { status, json }
  }

  /**
   * Send one prompt. With `conversationId`, continues that chat (same DeepSeek
   * session, parented on the last answer); otherwise starts a new chat.
   */
  async ask({ prompt, conversationId, model, thinking, search, onDelta, signal }) {
    const preset = typeof model === 'string' || model === undefined ? resolveModel(model) : model;
    if (!preset) throw new BridgeError(`Unknown model "${model}". Available: ${Object.keys(MODELS).join(', ')}`, 'unknown_model', 400);
    let convo = null;
    if (conversationId) {
      convo = this.conversations.get(conversationId);
      if (!convo) throw new BridgeError(`Unknown conversation_id "${conversationId}".`, 'unknown_conversation', 404);
    }
    const result = await this.#send('ask', {
      prompt,
      chatSessionId: convo?.chatSessionId ?? null,
      parentMessageId: convo?.parentMessageId ?? null,
      modelType: preset.modelType,
      thinking: thinking ?? preset.thinking,
      search: Boolean(search),
    }, { onDelta, signal });

    const id = conversationId ?? randomUUID();
    this.conversations.set(id, {
      chatSessionId: result.chatSessionId,
      parentMessageId: result.responseMessageId ?? convo?.parentMessageId ?? null,
    });
    return {
      conversationId: id,
      text: result.text ?? '',
      reasoning: result.reasoning ?? '',
      chatUrl: result.chatSessionId ? `https://chat.deepseek.com/a/chat/s/${result.chatSessionId}` : null,
    };
  }
}
