// Runs inside chat.deepseek.com. Reuses the fork's DeepSeek web client (login
// headers, proof-of-work, SSE stream decoding) so there is one protocol truth.
import {
  createChatSession,
  createClientHeaders,
  createPowHeaders,
  createPowHeadersForPath,
  submitContinueStreaming,
  submitEditStreaming,
  submitPromptStreaming,
  submitRegenerateStreaming,
} from './vendor/core/deepseek/active-client';
import { setRawResponseBodies } from './vendor/core/network/request-policy';

// Firefox blocks the size-limit wrapper around fetch bodies in content scripts.
setRawResponseBodies(true);

interface AskParams {
  prompt: string;
  chatSessionId: string | null;
  parentMessageId: number | null;
  modelType: string;
  thinking: boolean;
  search: boolean;
}

type Out =
  | { type: 'delta'; text?: string; reasoning?: string }
  | { type: 'done'; result: { chatSessionId: string; responseMessageId: number | null; text: string; reasoning: string } }
  | { type: 'error'; message: string; code?: string };

console.log('[DeepSeek Bridge] content script loaded');

const WASM_URL = chrome.runtime.getURL('deepseek/sha3_wasm_bg.wasm');

function errorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'DeepSeekAuthError') return 'not_logged_in';
  if (name === 'DeepSeekPowError') return 'pow_failed';
  if (name === 'AbortError') return 'cancelled';
  return 'deepseek_error';
}

async function runAsk(params: AskParams, emit: (out: Out) => void, signal: AbortSignal) {
  try {
    const clientHeaders = createClientHeaders({
      missingTokenMessage: 'Not logged in to chat.deepseek.com. Sign in on the DeepSeek tab, then retry.',
    });
    const chatSessionId = params.chatSessionId ?? (await createChatSession(clientHeaders, signal));
    const powHeaders = await createPowHeaders(clientHeaders, WASM_URL, signal);

    let reasoning = '';
    const turn = await submitPromptStreaming(
      {
        chatSessionId,
        parentMessageId: params.parentMessageId,
        modelType: params.modelType,
        prompt: params.prompt,
        refFileIds: [],
        thinkingEnabled: params.thinking,
        searchEnabled: params.search,
        clientHeaders,
        powHeaders,
      },
      {
        onTextChunk: (text) => emit({ type: 'delta', text }),
        onReasoningChunk: (delta, full) => {
          reasoning = full;
          emit({ type: 'delta', reasoning: delta });
        },
      },
      signal,
    );
    emit({
      type: 'done',
      result: {
        chatSessionId,
        responseMessageId: turn.responseMessageId,
        text: turn.assistantText,
        reasoning,
      },
    });
  } catch (error) {
    emit({
      type: 'error',
      code: errorCode(error),
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

interface EditParams {
  chatSessionId: string;
  messageId: number;
  prompt: string;
  thinking: boolean;
  search: boolean;
}

/** Replace an earlier user message; DeepSeek branches from it and answers the new text. */
async function runEdit(params: EditParams, emit: (out: Out) => void, signal: AbortSignal) {
  try {
    const clientHeaders = createClientHeaders({
      missingTokenMessage: 'Not logged in to chat.deepseek.com. Sign in on the DeepSeek tab, then retry.',
    });
    const powHeaders = await createPowHeadersForPath(clientHeaders, '/api/v0/chat/edit_message', WASM_URL, signal);
    let reasoning = '';
    const turn = await submitEditStreaming(
      {
        chatSessionId: params.chatSessionId,
        messageId: params.messageId,
        prompt: params.prompt,
        refFileIds: [],
        thinkingEnabled: params.thinking,
        searchEnabled: params.search,
        clientHeaders,
        powHeaders,
      },
      {
        onTextChunk: (text) => emit({ type: 'delta', text }),
        onReasoningChunk: (delta, full) => {
          reasoning = full;
          emit({ type: 'delta', reasoning: delta });
        },
      },
      signal,
    );
    emit({
      type: 'done',
      result: {
        chatSessionId: params.chatSessionId,
        responseMessageId: turn.responseMessageId,
        text: turn.assistantText,
        reasoning,
      },
    });
  } catch (error) {
    emit({
      type: 'error',
      code: errorCode(error),
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

interface RegenerateParams {
  chatSessionId: string;
  /** The assistant message to generate again. */
  messageId: number;
  thinking: boolean;
  search: boolean;
}

interface ContinueParams {
  chatSessionId: string;
  /** The assistant message whose cut-off answer to continue. */
  messageId: number;
}

/** Run one of the streamed turn actions (regenerate, continue) and report it like a normal answer. */
async function runStreamedTurn(
  chatSessionId: string,
  powPath: string,
  emit: (out: Out) => void,
  signal: AbortSignal,
  submit: (
    clientHeaders: Record<string, string>,
    powHeaders: Record<string, string>,
    callbacks: {
      onTextChunk: (text: string) => void;
      onReasoningChunk: (delta: string, full: string) => void;
    },
  ) => Promise<{ assistantText: string; responseMessageId: number | null }>,
) {
  try {
    const clientHeaders = createClientHeaders({
      missingTokenMessage: 'Not logged in to chat.deepseek.com. Sign in on the DeepSeek tab, then retry.',
    });
    const powHeaders = await createPowHeadersForPath(clientHeaders, powPath, WASM_URL, signal);
    let reasoning = '';
    const turn = await submit(clientHeaders, powHeaders, {
      onTextChunk: (text) => emit({ type: 'delta', text }),
      onReasoningChunk: (delta, full) => {
        reasoning = full;
        emit({ type: 'delta', reasoning: delta });
      },
    });
    emit({
      type: 'done',
      result: { chatSessionId, responseMessageId: turn.responseMessageId, text: turn.assistantText, reasoning },
    });
  } catch (error) {
    emit({
      type: 'error',
      code: errorCode(error),
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function runRegenerate(params: RegenerateParams, emit: (out: Out) => void, signal: AbortSignal) {
  return runStreamedTurn(params.chatSessionId, '/api/v0/chat/regenerate', emit, signal,
    (clientHeaders, powHeaders, callbacks) => submitRegenerateStreaming({
      chatSessionId: params.chatSessionId,
      childMessageId: params.messageId,
      thinkingEnabled: params.thinking,
      searchEnabled: params.search,
      clientHeaders,
      powHeaders,
    }, callbacks, signal));
}

function runContinue(params: ContinueParams, emit: (out: Out) => void, signal: AbortSignal) {
  return runStreamedTurn(params.chatSessionId, '/api/v0/chat/continue', emit, signal,
    (clientHeaders, powHeaders, callbacks) => submitContinueStreaming({
      chatSessionId: params.chatSessionId,
      messageId: params.messageId,
      clientHeaders,
      powHeaders,
    }, callbacks, signal));
}

// Chat-management calls. A strict allowlist: nothing else on DeepSeek's API can be reached
// through the bridge (in particular not delete_all, logout, or any account route).
const API_ALLOWLIST: Record<string, 'GET' | 'POST'> = {
  '/api/v0/chat_session/fetch_page': 'GET',
  '/api/v0/chat/history_messages': 'GET',
  '/api/v0/chat_session/update_title': 'POST',
  '/api/v0/chat_session/delete': 'POST',
  '/api/v0/chat_session/batch_update_pinned': 'POST',
  '/api/v0/chat/stop_stream': 'POST',
};

interface ApiParams {
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  json?: unknown;
}

async function runApi(params: ApiParams, emit: (out: Out) => void, signal: AbortSignal) {
  try {
    const method = API_ALLOWLIST[params.path];
    if (!method) throw new Error(`Route not allowed through the bridge: ${params.path}`);
    const clientHeaders = createClientHeaders({
      missingTokenMessage: 'Not logged in to chat.deepseek.com. Sign in on the DeepSeek tab, then retry.',
    });
    const url = new URL(params.path, location.origin);
    for (const [key, value] of Object.entries(params.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url.href, {
      method,
      credentials: 'include',
      signal,
      headers: { 'content-type': 'application/json', ...clientHeaders },
      body: method === 'POST' ? JSON.stringify(params.json ?? {}) : undefined,
    });
    const json = await response.json().catch(() => null);
    emit({ type: 'done', result: { status: response.status, json } as never });
  } catch (error) {
    emit({
      type: 'error',
      code: errorCode(error),
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function loggedIn(): boolean {
  try {
    createClientHeaders();
    return true;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'ping') reply({ ok: true });
});

// One long-lived port per request: the service worker bridges it to the WebSocket.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ds-bridge') return;
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener((msg: { type: string; params?: AskParams | ApiParams }) => {
    if (msg.type === 'cancel') {
      controller.abort();
    } else if (msg.type === 'status') {
      port.postMessage({ type: 'done', result: { ok: true, loggedIn: loggedIn(), url: location.href } });
    } else if (msg.type === 'ask' && msg.params) {
      void runAsk(msg.params as AskParams, (out) => port.postMessage(out), controller.signal);
    } else if (msg.type === 'edit' && msg.params) {
      void runEdit(msg.params as unknown as EditParams, (out) => port.postMessage(out), controller.signal);
    } else if (msg.type === 'regenerate' && msg.params) {
      void runRegenerate(msg.params as unknown as RegenerateParams, (out) => port.postMessage(out), controller.signal);
    } else if (msg.type === 'continue' && msg.params) {
      void runContinue(msg.params as unknown as ContinueParams, (out) => port.postMessage(out), controller.signal);
    } else if (msg.type === 'api' && msg.params) {
      void runApi(msg.params as unknown as ApiParams, (out) => port.postMessage(out), controller.signal);
    }
  });
});

// ---------------------------------------------------------------------------
// Small status pill so it is obvious the bridge is live (and what to do if not).
// ---------------------------------------------------------------------------
type Phase = 'no-tab' | 'connecting' | 'connected' | 'offline';

const PILL: Record<Phase, { color: string; text: string }> = {
  'no-tab': { color: '#9ca3af', text: 'DeepSeek Bridge' },
  connecting: { color: '#d97706', text: 'DeepSeek Bridge: connecting...' },
  connected: { color: '#16a34a', text: 'DeepSeek Bridge: connected' },
  offline: { color: '#dc2626', text: 'DeepSeek Bridge: app not running (node bridge/server/daemon.mjs)' },
};

function mountPill() {
  if (window.top !== window) return;
  // A reloaded extension leaves the previous copy's pill behind; keep exactly one.
  document.querySelectorAll('[data-ds-bridge-pill]').forEach((el) => el.remove());
  const host = document.createElement('div');
  host.setAttribute('data-ds-bridge-pill', '');
  host.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483646;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      .pill { display:flex; align-items:center; gap:8px; max-width:340px; padding:6px 11px; border-radius:999px;
        font:12px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif; color:#e8eaf0; background:rgba(24,27,34,.92);
        border:1px solid rgba(255,255,255,.12); box-shadow:0 4px 14px rgba(0,0,0,.25); cursor:pointer;
        transition:opacity .4s ease; backdrop-filter:blur(6px); }
      .dot { width:8px; height:8px; border-radius:50%; flex:none; }
      .pill.quiet { opacity:.35; } .pill.quiet:hover { opacity:1; }
      .pill.quiet .label { display:none; } .pill.quiet:hover .label { display:inline; }
    </style>
    <div class="pill" title="Click to hide"><span class="dot"></span><span class="label"></span></div>`;
  const pill = root.querySelector('.pill') as HTMLElement;
  const dot = root.querySelector('.dot') as HTMLElement;
  const label = root.querySelector('.label') as HTMLElement;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;

  const render = (phase: Phase) => {
    const view = PILL[phase] ?? PILL['no-tab'];
    dot.style.background = view.color;
    label.textContent = view.text;
    pill.classList.remove('quiet');
    clearTimeout(quietTimer);
    if (phase === 'connected') quietTimer = setTimeout(() => pill.classList.add('quiet'), 4000);
  };
  pill.addEventListener('click', () => host.remove());
  document.documentElement.appendChild(host);

  chrome.runtime.onMessage.addListener((msg: { type?: string; phase?: Phase }) => {
    if (msg?.type === 'state' && msg.phase) render(msg.phase);
  });
  try {
    chrome.runtime.sendMessage({ type: 'connection-state' }, (reply?: { phase?: Phase }) => {
      render(reply?.phase ?? 'connecting');
    });
  } catch {
    render('connecting');
  }
}

mountPill();
