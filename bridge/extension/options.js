const api = globalThis.browser ?? globalThis.chrome;
const DEFAULT_PORT = 8787;
const DEFAULT_TOKEN = 'deepseek-bridge';
const MAX_SYSTEM = 20000;
const $ = (id) => document.getElementById(id);

const COPY = {
  'no-tab': { title: 'Waiting for DeepSeek', detail: 'Open chat.deepseek.com and the bridge starts by itself.' },
  connecting: { title: 'Connecting', detail: 'Reaching the local bridge app.' },
  connected: { title: 'Connected', detail: 'Any tool can now talk to your DeepSeek chat.' },
  offline: { title: 'Bridge app not running', detail: 'Start it once in a terminal. This connects by itself afterwards.' },
};

let saved = { token: '', port: DEFAULT_PORT, system: '' };

/* ---- tabs ---- */
function showTab(name) {
  for (const button of document.querySelectorAll('nav [role="tab"]')) {
    button.setAttribute('aria-selected', String(button.dataset.tab === name));
  }
  for (const panel of document.querySelectorAll('main > section')) {
    panel.hidden = panel.id !== `tab-${name}`;
  }
  try { sessionStorage.setItem('tab', name); } catch { /* storage unavailable */ }
}

document.querySelector('nav').addEventListener('click', (event) => {
  const button = event.target.closest('[role="tab"]');
  if (button) showTab(button.dataset.tab);
});
document.querySelector('nav').addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  const tabs = [...document.querySelectorAll('nav [role="tab"]')];
  const index = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  next.focus();
  showTab(next.dataset.tab);
});

/* ---- connection status ---- */
function render(phase, error = '') {
  const copy = COPY[phase] ?? COPY['no-tab'];
  $('bridge').dataset.phase = phase;
  $('title').textContent = copy.title;
  $('detail').textContent = copy.detail;
  const showError = Boolean(error) && phase !== 'connected';
  $('err').textContent = error;
  $('err').hidden = !showError;
  $('startBox').hidden = phase !== 'offline';
  $('openBox').hidden = phase !== 'no-tab';
}

async function poll() {
  try {
    const reply = await api.runtime.sendMessage({ type: 'connection-state' });
    render(reply?.phase ?? 'no-tab', reply?.error ?? '');
  } catch {
    render('offline', 'The extension background is not responding. Reload the extension.');
  }
}

/* ---- copy buttons ---- */
async function copy(value, button) {
  try {
    await navigator.clipboard.writeText(value);
    button.classList.add('done');
    setTimeout(() => button.classList.remove('done'), 1200);
  } catch { /* clipboard unavailable */ }
}
$('copyCmd').addEventListener('click', (e) => copy($('startCmd').textContent, e.currentTarget));
$('copyBase').addEventListener('click', (e) => copy($('base').value, e.currentTarget));
$('copyKey').addEventListener('click', (e) => copy($('key').value, e.currentTarget));
$('openDs').addEventListener('click', () => api.tabs.create({ url: 'https://chat.deepseek.com/' }));

/* ---- system prompt ---- */
function renderSystem() {
  const text = $('system').value;
  $('sysCount').textContent = `${text.length.toLocaleString()} / ${MAX_SYSTEM.toLocaleString()}`;
  const on = saved.system.trim().length > 0;
  $('sysState').textContent = on ? 'On for new chats' : 'Off';
  $('sysState').classList.toggle('on', on);
  $('saveSystem').disabled = text.trim() === saved.system.trim();
  $('clearSystem').disabled = !on && text.length === 0;
}

async function saveSystem(value) {
  const text = value.trim().slice(0, MAX_SYSTEM);
  await api.storage.local.set({ systemPrompt: text });
  saved.system = text;
  $('system').value = text;
  renderSystem();
}

$('system').addEventListener('input', renderSystem);
$('saveSystem').addEventListener('click', () => saveSystem($('system').value));
$('clearSystem').addEventListener('click', () => saveSystem(''));

/* ---- settings ---- */
$('port').addEventListener('input', () => {
  $('port').value = $('port').value.replace(/\D/g, '').slice(0, 5);
});

$('save').addEventListener('click', async () => {
  await api.storage.local.set({
    token: $('token').value.trim(),
    port: Number($('port').value) || DEFAULT_PORT,
  });
  await load();
});
$('reset').addEventListener('click', async () => {
  await api.storage.local.remove(['token', 'port']);
  await load();
});

async function load() {
  const stored = await api.storage.local.get(['token', 'port', 'systemPrompt']);
  saved = {
    token: (typeof stored.token === 'string' && stored.token.trim()) || DEFAULT_TOKEN,
    port: Number(stored.port) || DEFAULT_PORT,
    system: typeof stored.systemPrompt === 'string' ? stored.systemPrompt : '',
  };
  $('base').value = `http://127.0.0.1:${saved.port}/v1`;
  $('key').value = saved.token;
  $('token').value = saved.token === DEFAULT_TOKEN ? '' : saved.token;
  $('port').value = saved.port;
  if (document.activeElement !== $('system')) $('system').value = saved.system;
  renderSystem();
  await poll();
}

try { $('ver').textContent = `v${api.runtime.getManifest().version}`; } catch { /* preview without the extension API */ }
let startTab = 'connect';
try { startTab = sessionStorage.getItem('tab') || 'connect'; } catch { /* storage unavailable */ }
showTab(startTab);
void load();
setInterval(poll, 1500);
