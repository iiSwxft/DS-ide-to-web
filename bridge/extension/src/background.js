const api = globalThis.browser ?? globalThis.chrome;
// Keeps a WebSocket to the local bridge while a chat.deepseek.com tab is open
// and relays each request to that tab's content script.
const DEEPSEEK = 'https://chat.deepseek.com/';
const DEFAULT_PORT = 8787;
const DEFAULT_TOKEN = 'deepseek-bridge'; // preset; must match bridge/server/config.mjs

let socket = null;
let phase = 'no-tab'; // no-tab | connecting | connected | offline
let retryTimer = null;
let lastError = '';
let connectWatchdog = null;
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

/** Is the content script alive in a DeepSeek tab? (false = tab open but page script missing) */
async function pageScriptAlive() {
  const tabs = await deepseekTabs();
  for (const tab of tabs) {
    try {
      const reply = await api.tabs.sendMessage(tab.id, { type: 'ping' });
      if (reply?.ok) return true;
    } catch { /* not injected in this tab */ }
  }
  return false;
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

async function storedSystemPrompt() {
  const { systemPrompt } = await api.storage.local.get('systemPrompt');
  return typeof systemPrompt === 'string' ? systemPrompt : '';
}

async function sendHello(ws) {
  ws.send(JSON.stringify({
    type: 'hello',
    version: api.runtime.getManifest().version,
    systemPrompt: await storedSystemPrompt(),
  }));
}

async function sendSettings() {
  send({ type: 'settings', systemPrompt: await storedSystemPrompt() });
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
    const port = await connectToAnyTab();
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

/** Try every open DeepSeek tab (newest first) and connect to the first one whose page script answers. */
async function connectToAnyTab() {
  const notes = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    notes.length = 0;
    const tabs = (await deepseekTabs()).sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    if (tabs.length === 0) throw new Error('No chat.deepseek.com tab is open.');
    for (const tab of tabs) {
      try {
        const reply = await api.tabs.sendMessage(tab.id, { type: 'ping' });
        if (reply?.ok) return api.tabs.connect(tab.id, { name: 'ds-bridge' });
        notes.push(`tab ${tab.id} (${tab.status}): empty reply ${JSON.stringify(reply)}`);
      } catch (error) {
        notes.push(`tab ${tab.id} (${tab.status}, ${tab.url?.slice(0, 40)}): ${error?.message ?? error}`);
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The extension is not running on any chat.deepseek.com tab. ${notes.join(' | ')}`);
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
  try {
    await refreshInner();
  } catch (error) {
    lastError = `${error?.name ?? 'Error'}: ${error?.message ?? error}`;
    closeSocket();
    setPhase('offline');
    scheduleRetry(5000);
  }
}

async function refreshInner() {
  const hasTab = (await deepseekTabs()).length > 0;
  if (!hasTab) {
    closeSocket();
    lastError = '';
    setPhase('no-tab');
    return;
  }
  if (socket && socket.readyState <= WebSocket.OPEN) return;

  const { token, port } = await settings();
  setPhase('connecting');
  let opened = false;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ext?token=${encodeURIComponent(token)}`);
  socket = ws;
  // A socket that neither opens nor fails must not leave us stuck on "connecting".
  clearTimeout(connectWatchdog);
  connectWatchdog = setTimeout(() => {
    if (socket === ws && !opened) {
      lastError = `No answer from ws://127.0.0.1:${port} after 6s.`;
      closeSocket();
      setPhase('offline');
      scheduleRetry(3000);
    }
  }, 6000);
  ws.onopen = () => {
    opened = true;
    lastError = '';
    clearTimeout(connectWatchdog);
    setPhase('connected');
    void sendHello(ws);
  };
  ws.onmessage = (event) => {
    try { void handleRequest(JSON.parse(event.data)); } catch { /* ignore malformed */ }
  };
  const onGone = (event) => {
    if (socket !== ws) return;
    socket = null;
    clearTimeout(connectWatchdog);
    if (!opened) {
      lastError = `Connection to ws://127.0.0.1:${port} failed (code ${event?.code ?? '?'}). The app is not running, or it rejected the key.`;
    }
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
let tabDebounce = null;
function refreshSoon() {
  clearTimeout(tabDebounce);
  tabDebounce = setTimeout(() => void refresh(), 400);
}
api.tabs.onCreated.addListener(refreshSoon);
api.tabs.onRemoved.addListener(refreshSoon);
api.tabs.onUpdated.addListener((_id, info) => {
  if (info.url || info.status === 'complete') refreshSoon();
});
api.runtime.onStartup.addListener(() => void refresh());
api.runtime.onInstalled.addListener(() => void refresh());
api.storage.onChanged.addListener((changes) => {
  if (changes.token || changes.port) {
    closeSocket();
    void refresh();
  } else if (changes.systemPrompt) {
    // The popup's system prompt changed: push it to the bridge right away.
    void sendSettings();
  }
});
api.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'connection-state') {
    void (async () => {
      // Re-check the tab list on demand so a stale "connected" never lingers.
      if ((await deepseekTabs()).length === 0 && phase !== 'no-tab') await refresh();
      reply({ phase, error: lastError, pageScript: phase === 'no-tab' ? null : await pageScriptAlive() });
    })();
    return true; // async reply
  }
  if (msg?.type === 'retry-now') {
    void refresh();
    reply({ phase, error: lastError });
  }
  return undefined;
});
void refresh();
