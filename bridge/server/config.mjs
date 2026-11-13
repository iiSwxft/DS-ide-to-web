import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 8787;

export function configDir() {
  return process.env.DS_BRIDGE_HOME || join(homedir(), '.ds-ide-to-web');
}

export function getPort() {
  const raw = process.env.DS_BRIDGE_PORT;
  const port = raw ? Number(raw) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid DS_BRIDGE_PORT: ${raw}`);
  }
  return port;
}

/** Shared secret used by the extension (WebSocket) and by HTTP/MCP clients (Bearer). */
export function loadOrCreateToken() {
  if (process.env.DS_BRIDGE_TOKEN) return process.env.DS_BRIDGE_TOKEN;
  const dir = configDir();
  const file = join(dir, 'token');
  if (existsSync(file)) {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  }
  mkdirSync(dir, { recursive: true });
  const token = randomBytes(24).toString('hex');
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  return token;
}

export function tokenFile() {
  return join(configDir(), 'token');
}
