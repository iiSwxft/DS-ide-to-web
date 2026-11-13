const api = globalThis.browser ?? globalThis.chrome;
// Service worker: keeps a WebSocket to the local bridge and relays each request
// to a chat.deepseek.com tab's content script.
const DEEPSEEK = 'https://chat.deepseek.com/';
const DEFAULT_PORT = 8787;

let socket = null;
let connecting = false;
const active = new Map(); // request id -> content-script port

async function settings() {
  const { token = '', port = DEFAULT_PORT } = await api.storage.local.get(['token', 'port']);
  return { token: String(token).trim(), port: Number(port) || DEFAULT_PORT };
}

function send(message) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

async function findDeepSeekTab() {
  const tabs = await api.tabs.query({ url: `${DEEPSEEK}*` });
  const ready = tabs.find((t) => t.status === 'complete') ?? tabs[0];
  if (ready) return ready;
  const created = await api.tabs.create({ url: DEEPSEEK, active: false });
  await new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === created.id && info.status === 'complete') {
        api.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    api.tabs.onUpdated.addListener(listener);
    setTimeout(() => { api.tabs.onUpdated.removeListener(listener); resolve(); }, 20000);
  });
  return created;
}

async function connectToTab(tab) {
  // The content script registers its listeners at document_idle; ping until it answers.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const reply = await api.tabs.sendMessage(tab.id, { type: 'ping' });
      if (reply?.ok) return api.tabs.connect(tab.id, { name: 'ds-bridge' });
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Could not reach the DeepSeek tab. Reload chat.deepseek.com and retry.');
}

async function handleRequest(msg) {
  const { id, type, params } = msg;
  if (type === 'cancel') {
    active.get(id)?.postMessage({ type: 'cancel' });
    return;
  }
  try {
    const tab = await findDeepSeekTab();
    const port = await connectToTab(tab);
    active.set(id, port);
    let settled = false;
    port.onMessage.addListener((out) => {
      if (out.type === 'done' || out.type === 'error') settled = true;
      send({ id, ...out });
      if (settled) { active.delete(id); try { port.disconnect(); } catch { /* gone */ } }
    });
    port.onDisconnect.addListener(() => {
      active.delete(id);
      if (!settled) {
        send({ id, type: 'error', code: 'tab_closed', message: 'The DeepSeek tab closed or reloaded mid-request.' });
      }
    });
    port.postMessage({ type, params });
  } catch (error) {
    send({ id, type: 'error', code: 'no_deepseek_tab', message: String(error.message ?? error) });
  }
}

async function connect() {
  if (connecting || (socket && socket.readyState <= WebSocket.OPEN)) return;
  const { token, port } = await settings();
  if (!token) return;
  connecting = true;
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ext?token=${encodeURIComponent(token)}`);
    socket = ws;
    ws.onopen = () => {
      connecting = false;
      ws.send(JSON.stringify({ type: 'hello', version: api.runtime.getManifest().version }));
    };
    ws.onmessage = (event) => {
      try { void handleRequest(JSON.parse(event.data)); } catch { /* ignore malformed */ }
    };
    ws.onclose = ws.onerror = () => {
      connecting = false;
      if (socket === ws) socket = null;
    };
  } catch {
    connecting = false;
  }
}

// MV3 workers sleep; an alarm wakes us to reconnect, and ping keeps the socket warm.
api.alarms.create('ds-bridge-keepalive', { periodInMinutes: 0.5 });
api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'ds-bridge-keepalive') return;
  if (socket && socket.readyState === WebSocket.OPEN) send({ type: 'hello', version: api.runtime.getManifest().version });
  else void connect();
});
api.runtime.onStartup.addListener(() => void connect());
api.runtime.onInstalled.addListener(() => void connect());
api.storage.onChanged.addListener((changes) => {
  if (changes.token || changes.port) {
    try { socket?.close(); } catch { /* ignore */ }
    socket = null;
    void connect();
  }
});
api.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'connection-state') {
    reply({ connected: Boolean(socket && socket.readyState === WebSocket.OPEN) });
  }
});
void connect();
