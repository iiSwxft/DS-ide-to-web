// Runs inside chat.deepseek.com. Reuses the fork's DeepSeek web client (login
// headers, proof-of-work, SSE stream decoding) so there is one protocol truth.
import {
  createChatSession,
  createClientHeaders,
  createPowHeaders,
  submitPromptStreaming,
} from '../../../core/deepseek/active-client';

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
  port.onMessage.addListener((msg: { type: string; params?: AskParams }) => {
    if (msg.type === 'cancel') {
      controller.abort();
    } else if (msg.type === 'status') {
      port.postMessage({ type: 'done', result: { ok: true, loggedIn: loggedIn(), url: location.href } });
    } else if (msg.type === 'ask' && msg.params) {
      void runAsk(msg.params, (out) => port.postMessage(out), controller.signal);
    }
  });
});
