import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, statSync, truncateSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST, bridgeVersion, configDir, getPort, isOlderVersion, loadToken } from './config.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Is something answering on the bridge port, and which version of the bridge app is it? */
async function probe(base, token) {
  try {
    // An older bridge app has no /api/version: it still answers (404), which tells us it is old.
    const res = await fetch(`${base}/api/version`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2500),
    });
    const body = await res.json().catch(() => ({}));
    return { up: true, version: body?.version ?? null };
  } catch {
    return { up: false, version: null };
  }
}

const reachable = async (base, token) => (await probe(base, token)).up;

function openLog() {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'daemon.log');
  try {
    if (statSync(file).size > 1024 * 1024) truncateSync(file, 0); // keep the log small
  } catch { /* no log yet */ }
  return openSync(file, 'a');
}

/**
 * Make sure the bridge app is running. If not, start it as a detached background process
 * that outlives this MCP process, so every AI chat shares one bridge and one browser link.
 * Never writes to stdout (the MCP protocol owns it). Returns 'running', 'started', or 'failed'.
 */
export async function ensureDaemon(selfUrl) {
  const base = `http://${HOST}:${getPort()}`;
  const token = loadToken();
  const running = await probe(base, token);
  if (running.up) {
    // After an update, an old bridge app may still be running from before. Replace it, but never with
    // something older: two tools on different versions must not keep restarting each other's app.
    const mine = bridgeVersion();
    // An app started by hand from source reports "dev"; leave it alone.
    if (mine === 'dev' || running.version === 'dev' || !isOlderVersion(running.version, mine)) return 'running';
    await stopDaemon();
    for (let i = 0; i < 20 && (await reachable(base, token)); i += 1) await sleep(150);
    if (await reachable(base, token)) return 'running'; // it would not stop; keep using it
  }

  let log;
  try {
    log = openLog();
    const child = spawn(process.execPath, [fileURLToPath(selfUrl), 'daemon'], {
      detached: true,
      stdio: ['ignore', log, log],
      windowsHide: true,
      env: process.env,
    });
    child.on('error', (error) => process.stderr.write(`[ds-ide-to-web] could not start the bridge app: ${error.message}\n`));
    child.unref();
  } finally {
    if (log !== undefined) closeSync(log);
  }

  for (let i = 0; i < 40; i += 1) {
    await sleep(150);
    if (await reachable(base, token)) return 'started';
  }
  process.stderr.write(`[ds-ide-to-web] the bridge app did not start on port ${getPort()}; see ${join(configDir(), 'daemon.log')}\n`);
  return 'failed';
}

/** Ask a running bridge app to exit. Returns true if it was running. */
export async function stopDaemon() {
  const base = `http://${HOST}:${getPort()}`;
  try {
    const res = await fetch(`${base}/api/shutdown`, {
      method: 'POST',
      headers: { authorization: `Bearer ${loadToken()}` },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
