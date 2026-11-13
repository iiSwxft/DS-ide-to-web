const api = globalThis.browser ?? globalThis.chrome;
// Keeps a WebSocket to the local bridge while a chat.deepseek.com tab is open
// and relays each request to that tab's content script.
const DEEPSEEK = 'https://chat.deepseek.com/';
const DEFAULT_PORT = 8787;
const DEFAULT_TOKEN = 'deepseek-bridge'; // preset; must match bridge/server/config.mjs

let socket = null;
let phase = 'no-tab'; // no-tab | connecting | connected | offline
let retryTimer = null;
const active = new Map(); // request id -> content-script port

async function settings() {
  const { token, port } = await api.storage.local.get(['token', 'port']);
  return {
    token: (typeof token === 'string' && token.trim()) || DEFAULT_TOKEN,
    port: Number(port) || DEFAULT_PORT,
  };
}

async function deepseekTabs() {
  return api.tabs.query({ url: `${DEEPSEEK}*` });
}

function setPhase(next) {
  if (phase === next) return;
  phase = next;
  void broadcast();
}

async function broadcast() {
  try {
    for (const tab of await deepseekTabs()) {
      api.tabs.sendMessage(tab.id, { type: 'state', phase }).catch(() => {});
    }
  } catch { /* no tabs permission yet */ }
}

function send(message) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

async function handleRequest(msg) {
  const { id, type, params } = msg;
  if (type === 'cancel') {
    active.get(id)?.postMessage({ type: 'cancel' });
    return;
  }
  try {
    const tabs = await deepseekTabs();
    const tab = tabs.find((t) => t.status === 'complete') ?? tabs[0];
    if (!tab) throw new Error('No chat.deepseek.com tab is open.');
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

function scheduleRetry(delayMs = 3000) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void refresh(), delayMs);
}

function closeSocket() {
  const old = socket;
  socket = null;
  try { old?.close(); } catch { /* already closed */ }
}

/** Single place that decides whether the bridge should be running right now. */
async function refresh() {
  clearTimeout(retryTimer);
  const hasTab = (await deepseekTabs()).length > 0;
  if (!hasTab) {
    closeSocket();
    setPhase('no-tab');
    return;
  }
  if (socket && socket.readyState <= WebSocket.OPEN) return;

  const { token, port } = await settings();
  setPhase('connecting');
  let opened = false;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ext?token=${encodeURIComponent(token)}`);
  socket = ws;
  ws.onopen = () => {
    opened = true;
    setPhase('connected');
    ws.send(JSON.stringify({ type: 'hello', version: api.runtime.getManifest().version }));
  };
  ws.onmessage = (event) => {
    try { void handleRequest(JSON.parse(event.data)); } catch { /* ignore malformed */ }
  };
  const onGone = () => {
    if (socket !== ws) return;
    socket = null;
    setPhase(opened ? 'connecting' : 'offline');
    scheduleRetry(opened ? 1000 : 3000);
  };
  ws.onclose = onGone;
  ws.onerror = () => {};
}

// MV3 workers sleep; the alarm wakes us to re-check, and tab events react instantly.
api.alarms.create('ds-bridge-keepalive', { periodInMinutes: 0.5 });
api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ds-bridge-keepalive') void refresh();
});
api.tabs.onCreated.addListener(() => void refresh());
api.tabs.onRemoved.addListener(() => void refresh());
api.tabs.onUpdated.addListener((_id, info) => {
  if (info.url || info.status === 'complete') void refresh();
});
api.runtime.onStartup.addListener(() => void refresh());
api.runtime.onInstalled.addListener(() => void refresh());
api.storage.onChanged.addListener((changes) => {
  if (changes.token || changes.port) {
    closeSocket();
    void refresh();
  }
});
api.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'connection-state') {
    reply({ phase });
  } else if (msg?.type === 'retry-now') {
    void refresh();
    reply({ phase });
  }
});
void refresh();
