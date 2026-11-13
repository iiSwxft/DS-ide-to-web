const api = globalThis.browser ?? globalThis.chrome;
const DEFAULT_PORT = 8787;
const DEFAULT_TOKEN = 'deepseek-bridge';
const $ = (id) => document.getElementById(id);

const COPY = {
  'no-tab': { title: 'Waiting for DeepSeek', detail: 'Open chat.deepseek.com and the bridge starts by itself.' },
  connecting: { title: 'Connecting...', detail: 'Reaching the local bridge app.' },
  connected: { title: 'Connected', detail: 'Any tool can now talk to your DeepSeek chat.' },
  offline: { title: 'Bridge app not running', detail: 'Start it once in a terminal, then this connects automatically.' },
};

let current = { token: DEFAULT_TOKEN, port: DEFAULT_PORT };

function render(phase, error = '') {
  $('err').textContent = error;
  $('err').classList.toggle('hidden', !error || phase === 'connected');
  const copy = COPY[phase] ?? COPY['no-tab'];
  $('dot').dataset.phase = phase;
  $('title').textContent = copy.title;
  $('detail').textContent = ` ${copy.detail}`;
  $('startBox').classList.toggle('hidden', phase !== 'offline');
  $('openBox').classList.toggle('hidden', phase !== 'no-tab');
}

async function poll() {
  try {
    const reply = await api.runtime.sendMessage({ type: 'connection-state' });
    render(reply?.phase ?? 'no-tab', reply?.error ?? '');
  } catch {
    render('offline', 'Extension background is not responding. Reload the extension.');
  }
}

const MAX_SYSTEM = 20000;
let savedSystem = '';

function renderSystem() {
  const text = $('system').value;
  $('sysCount').textContent = `${text.length.toLocaleString()} / ${MAX_SYSTEM.toLocaleString()}`;
  const on = savedSystem.trim().length > 0;
  $('sysState').textContent = on ? 'On: used for new chats' : 'Off';
  $('sysState').classList.toggle('on', on);
  $('saveSystem').disabled = text.trim() === savedSystem.trim();
}

async function saveSystem(value) {
  const text = value.trim().slice(0, MAX_SYSTEM);
  await api.storage.local.set({ systemPrompt: text });
  savedSystem = text;
  $('system').value = text;
  renderSystem();
}

$('system').addEventListener('input', renderSystem);
$('saveSystem').addEventListener('click', () => saveSystem($('system').value));
$('clearSystem').addEventListener('click', () => saveSystem(''));

async function load() {
  const stored = await api.storage.local.get(['token', 'port', 'systemPrompt']);
  savedSystem = typeof stored.systemPrompt === 'string' ? stored.systemPrompt : '';
  if (document.activeElement !== $('system')) $('system').value = savedSystem;
  renderSystem();
  current = {
    token: (typeof stored.token === 'string' && stored.token.trim()) || DEFAULT_TOKEN,
    port: Number(stored.port) || DEFAULT_PORT,
  };
  $('base').value = `http://127.0.0.1:${current.port}/v1`;
  $('key').value = current.token;
  $('token').value = current.token === DEFAULT_TOKEN ? '' : current.token;
  $('port').value = current.port;
  await poll();
}

async function copy(value, button) {
  try {
    await navigator.clipboard.writeText(value);
    const label = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = label; }, 1100);
  } catch { /* clipboard unavailable */ }
}

// Port is a plain text field (no browser spinner arrows); keep it digits-only.
$('port').addEventListener('input', () => {
  $('port').value = $('port').value.replace(/\D/g, '').slice(0, 5);
});

$('copyCmd').addEventListener('click', (e) => copy($('startCmd').textContent, e.currentTarget));
$('copyBase').addEventListener('click', (e) => copy($('base').value, e.currentTarget));
$('copyKey').addEventListener('click', (e) => copy($('key').value, e.currentTarget));
$('openDs').addEventListener('click', () => api.tabs.create({ url: 'https://chat.deepseek.com/' }));

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

void load();
setInterval(poll, 1500);
