const $ = (id) => document.getElementById(id);

async function refreshState() {
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'connection-state' });
    $('state').textContent = `Status: ${reply?.connected ? 'connected to bridge' : 'not connected'}`;
  } catch {
    $('state').textContent = 'Status: background not responding';
  }
}

async function load() {
  const { token = '', port = 8787 } = await chrome.storage.local.get(['token', 'port']);
  $('token').value = token;
  $('port').value = port;
  await refreshState();
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ token: $('token').value.trim(), port: Number($('port').value) || 8787 });
  $('state').textContent = 'Status: connecting...';
  setTimeout(refreshState, 1200);
});

void load();
