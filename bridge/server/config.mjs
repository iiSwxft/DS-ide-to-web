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

/**
 * Zero-config default: the extension and OpenAI-style clients share this
 * well-known key. It is safe to publish because the bridge only listens on
 * 127.0.0.1, rejects browser-origin requests, and checks the Host header
 * (no DNS rebinding). For stricter setups set DS_BRIDGE_TOKEN or create the
 * token file, and use that value in the extension's Advanced settings.
 */
export const DEFAULT_TOKEN = 'deepseek-bridge';

export function tokenFile() {
  return join(configDir(), 'token');
}

export function loadToken() {
  if (process.env.DS_BRIDGE_TOKEN) return process.env.DS_BRIDGE_TOKEN;
  const file = tokenFile();
  if (existsSync(file)) {
    const custom = readFileSync(file, 'utf8').trim();
    if (custom) return custom;
  }
  return DEFAULT_TOKEN;
}

/** Create a random custom token file (opt-in hardening). */
export function createCustomToken() {
  mkdirSync(configDir(), { recursive: true });
  const token = randomBytes(24).toString('hex');
  writeFileSync(tokenFile(), `${token}
`, { mode: 0o600 });
  return token;
}
