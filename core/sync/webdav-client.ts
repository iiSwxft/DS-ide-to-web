import type { WebdavSyncConfig } from '../types';

function buildUrl(config: WebdavSyncConfig, file?: string): string {
  const base = config.url.replace(/\/+$/, '');
  const path = config.remotePath.replace(/^\/+|\/+$/g, '');
  if (file) return `${base}/${path}/${file}`;
  return `${base}/${path}`;
}

function headers(config: WebdavSyncConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: 'Basic ' + toBase64Utf8(`${config.username}:${config.password}`),
    ...extra,
  };
}

/**
 * UTF-8-safe base64 for the Basic auth header. `btoa` throws on non-Latin-1
 * characters (e.g. CJK credentials), breaking WebDAV sync entirely (M9).
 */
function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function webdavTest(config: WebdavSyncConfig): Promise<void> {
  const url = config.url.replace(/\/+$/, '') + '/';
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers: headers(config, { Depth: '0' }),
  });
  if (res.status === 401) throw new Error('Authentication failed, please check your username and password');
  if (res.status === 403) throw new Error('Access denied');
  if (res.status === 404) throw new Error('Server address not found');
  if (res.status !== 207 && !res.ok) throw new Error(`Connection failed (HTTP ${res.status})`);
}

export async function webdavMkcol(config: WebdavSyncConfig): Promise<void> {
  const url = buildUrl(config) + '/';
  const res = await fetch(url, {
    method: 'MKCOL',
    headers: headers(config),
  });
  if (res.status === 405 || res.status === 301 || res.ok) return;
  if (res.status === 409) throw new Error(`Unable to create remote directory, please make sure the parent directory exists: ${config.remotePath}`);
  throw new Error(`Failed to create remote directory (HTTP ${res.status})`);
}

export async function webdavGet(config: WebdavSyncConfig, file: string): Promise<string | null> {
  const url = buildUrl(config, file);
  const res = await fetch(url, {
    method: 'GET',
    headers: headers(config),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to download ${file} (HTTP ${res.status})`);
  return res.text();
}

export async function webdavPut(config: WebdavSyncConfig, file: string, content: string): Promise<void> {
  const url = buildUrl(config, file);
  const res = await fetch(url, {
    method: 'PUT',
    headers: headers(config, { 'Content-Type': 'application/json; charset=utf-8' }),
    body: content,
  });
  if (!res.ok) throw new Error(`Failed to upload ${file} (HTTP ${res.status})`);
}
