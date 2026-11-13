import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.mjs');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function status(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      headers: { authorization: 'Bearer deepseek-bridge' },
      signal: AbortSignal.timeout(800),
    });
    return res.status;
  } catch {
    return null;
  }
}

test('the MCP server starts the bridge app by itself, which outlives it and can be stopped', async () => {
  const port = await freePort();
  const env = { ...process.env, DS_BRIDGE_PORT: String(port), DS_BRIDGE_HOME: mkdtempSync(join(tmpdir(), 'dsb-')) };
  delete env.DS_BRIDGE_TOKEN;

  assert.equal(await status(port), null, 'nothing should be running before the test');

  const child = spawn(process.execPath, [cli], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });

  const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'deepseek_status', arguments: {} } });

  const deadline = Date.now() + 15000;
  while (!/"id":2/.test(out) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  assert.match(out, /"id":2/, `MCP did not answer the tool call. stderr: ${err}`);
  assert.doesNotMatch(out.split('\n').filter((l) => l && !l.startsWith('{')).join(''), /./, 'stdout must carry only protocol messages');

  child.kill();
  await new Promise((r) => child.on('exit', r));

  assert.equal(await status(port), 200, 'the bridge app must keep running after the MCP process exits');

  const stopped = execFileSync(process.execPath, [cli, 'stop'], { env, encoding: 'utf8' });
  assert.match(stopped, /stopped/i);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(await status(port), null, 'the bridge app must be gone after stop');
});
