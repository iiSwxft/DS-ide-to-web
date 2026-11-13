import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, statSync, truncateSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST, configDir, getPort, loadToken } from './config.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when something already answers on the bridge port (any HTTP answer counts). */
async function reachable(base, token) {
  try {
    await fetch(`${base}/api/status`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(800),
    });
    return true;
  } catch {
    return false;
  }
}

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
  if (await reachable(base, token)) return 'running';

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
