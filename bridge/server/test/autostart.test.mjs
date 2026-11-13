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

test('a newer MCP server replaces an older bridge app, but never the other way round', async () => {
  const port = await freePort();
  const home = mkdtempSync(join(tmpdir(), 'dsb-'));
  const envFor = (version) => {
    const env = { ...process.env, DS_BRIDGE_PORT: String(port), DS_BRIDGE_HOME: home, DS_BRIDGE_TEST_VERSION: version };
    delete env.DS_BRIDGE_TOKEN;
    return env;
  };
  const versionOnPort = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/version`, { headers: { authorization: 'Bearer deepseek-bridge' }, signal: AbortSignal.timeout(800) });
      return (await res.json()).version;
    } catch {
      return null;
    }
  };
  // Runs an MCP server for one tool call and closes it, leaving the bridge app it started running.
  const launchMcp = async (version) => {
    const child = spawn(process.execPath, [cli], { env: envFor(version), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    const deadline = Date.now() + 20000;
    while (!/"id":1/.test(out) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    assert.match(out, /"id":1/, 'MCP did not answer');
    child.kill();
    await new Promise((r) => child.on('exit', r));
  };

  try {
    await launchMcp('1.0.0');
    assert.equal(await versionOnPort(), '1.0.0', 'the first MCP server starts the app');

    await launchMcp('2.0.0');
    assert.equal(await versionOnPort(), '2.0.0', 'a newer MCP server must replace the older app');

    await launchMcp('1.5.0');
    assert.equal(await versionOnPort(), '2.0.0', 'an older MCP server must not downgrade the app');
  } finally {
    try { execFileSync(process.execPath, [cli, 'stop'], { env: envFor('9.9.9') }); } catch { /* already gone */ }
  }
});

test('a bridge app started by hand from source ("dev") is never replaced', async () => {
  const port = await freePort();
  const home = mkdtempSync(join(tmpdir(), 'dsb-'));
  const envFor = (version) => {
    const env = { ...process.env, DS_BRIDGE_PORT: String(port), DS_BRIDGE_HOME: home, DS_BRIDGE_TEST_VERSION: version };
    delete env.DS_BRIDGE_TOKEN;
    return env;
  };
  const versionOnPort = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/version`, { headers: { authorization: 'Bearer deepseek-bridge' }, signal: AbortSignal.timeout(800) });
      return (await res.json()).version;
    } catch {
      return null;
    }
  };
  const run = async (version) => {
    const child = spawn(process.execPath, [cli], { env: envFor(version), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) + '\n');
    const deadline = Date.now() + 20000;
    while (!/"id":1/.test(out) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    child.kill();
    await new Promise((r) => child.on('exit', r));
  };
  try {
    await run('dev');
    assert.equal(await versionOnPort(), 'dev');
    await run('3.0.0');
    assert.equal(await versionOnPort(), 'dev', 'a hand-started app must be left alone');
  } finally {
    try { execFileSync(process.execPath, [cli, 'stop'], { env: envFor('9.9.9') }); } catch { /* already gone */ }
  }
});
