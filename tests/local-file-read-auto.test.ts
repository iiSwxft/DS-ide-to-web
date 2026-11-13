// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error the host file-provider.mjs is a pure JS implementation with no type declaration file
import { readTextFileWindow } from '../packages/shell-host/native/file-provider.mjs';
import { callLocalFileReadAuto, callMcpTool } from '../core/mcp/client';
import type { McpServerConfig, McpProtocolTransport, McpCallToolResult } from '../core/mcp/types';

function makeTempFile(content: string | Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), 'lfr-'));
  const p = join(dir, 'sample.txt');
  writeFileSync(p, content as never, typeof content === 'string' ? 'utf8' : undefined);
  return p;
}

// Shell Native Host identity (displayName matches SHELL_MCP_SERVER_NAME); auto continuation reads only apply to it.
function makeServer(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 's', displayName: 'Shell Local', enabled: true,
    transport: { kind: 'native_messaging', nativeHost: 'com.deepseek_pp.shell' },
    timeouts: { connectMs: 0, requestMs: 30000, discoveryMs: 0 },
    limits: { maxResultBytes: 64000, maxToolCount: 100 },
    version: 1, status: 'ready', lastConnectedAt: null, lastError: null,
    createdAt: 0, updatedAt: 0, headers: [], secrets: [],
    allowlist: { mode: 'all', toolNames: [] },
    execution: { mode: 'local', enabled: true },
    ...overrides,
  } as unknown as McpServerConfig;
}

// Third-party MCP server: exposes a local_file_read with the same name but is not the Shell Native Host.
function makeThirdPartyServer(): McpServerConfig {
  return makeServer({
    id: 'third-party',
    displayName: 'Some Other MCP',
    transport: { kind: 'stdio_bridge' },
  } as Partial<McpServerConfig>);
}

function makeTransport(windows: McpCallToolResult[]): McpProtocolTransport {
  let i = 0;
  const request = async () => {
    const result = windows[i] ?? windows[windows.length - 1];
    i++;
    return { jsonrpc: '2.0', id: 1, result } as unknown as Awaited<ReturnType<McpProtocolTransport['request']>>;
  };
  return { request } as unknown as McpProtocolTransport;
}

function windowResult(content: string, nextStart: number, totalChars: number, truncated: boolean): McpCallToolResult {
  return {
    content: [{ type: 'text', text: `Read ${content.length} characters` }],
    structuredContent: { data: { path: '/x', content, start: 0, nextStart, maxChars: content.length, totalChars, truncated } },
  };
}

// Host simulation that supplies content according to the max_chars actually requested by the caller, used to verify total-budget semantics.
function makeBudgetAwareTransport(totalCharsInFile: number): {
  transport: McpProtocolTransport;
  requestedMaxChars: number[];
} {
  const requestedMaxChars: number[] = [];
  let served = 0;
  const request = async (payload: unknown) => {
    const args = (payload as { params?: { arguments?: Record<string, unknown> } })?.params?.arguments ?? {};
    const want = Number(args.max_chars ?? 0);
    requestedMaxChars.push(want);
    const give = Math.min(want, totalCharsInFile - served);
    const content = 'x'.repeat(Math.max(0, give));
    served += content.length;
    return {
      jsonrpc: '2.0',
      id: 1,
      result: windowResult(content, served, totalCharsInFile, served < totalCharsInFile),
    } as unknown as Awaited<ReturnType<McpProtocolTransport['request']>>;
  };
  return { transport: { request } as unknown as McpProtocolTransport, requestedMaxChars };
}

function autoReadData(result: { output?: unknown }): {
  content: string;
  windows: number;
  totalChars: number;
  charsReturned: number;
  truncated: boolean;
} {
  return (result.output as { data: never }).data;
}

describe('readTextFileWindow (host OOM protection)', () => {
  it('mixed CJK text has no garbling and contiguous windows concatenate to the original', () => {
    // Chinese characters are intentional multi-byte (UTF-8) test input.
    const mixed = 'Hello 世界 🌍 中文测试 abc 混合内容 12345 emoji😀 结尾';
    const totalChars = Array.from(mixed).length;
    const path = makeTempFile(mixed);
    const window = 5;
    let acc = '';
    let start = 0;
    let guard = 0;
    while (guard < 1000) {
      guard++;
      const { content, totalChars: tc, charsRead } = readTextFileWindow(path, start, window);
      expect(tc).toBe(totalChars);
      // Regression guard: charsRead must equal the Unicode code point count of the returned content (UTF-16 length is too high with emoji surrogate pairs)
      expect(charsRead).toBe(Array.from(content).length);
      acc += content;
      // Advance in Unicode code point units (same unit as the host nextStart = start + charsRead)
      start += charsRead;
      if (charsRead < window) break;
    }
    expect(acc).toBe(mixed);
  });

  it('first window read from 0 returns the correct character count', () => {
    const s = 'abcdefghij';
    const path = makeTempFile(s);
    const { content, totalChars } = readTextFileWindow(path, 0, 3);
    expect(content).toBe('abc');
    expect(totalChars).toBe(10);
  });

  it('start beyond the file character count returns empty with the correct totalChars', () => {
    const s = 'abc';
    const path = makeTempFile(s);
    const { content, totalChars } = readTextFileWindow(path, 100, 10);
    expect(content).toBe('');
    expect(totalChars).toBe(3);
  });

  it('medium-large file (about 5MB) is read on demand without loading the whole file into memory, windows are correct', () => {
    const unit = '中a🌍'; // 4 characters ≈ 9 bytes (the Chinese char is intentional multi-byte input)
    const repeat = 580_000; // ≈ 5MB
    const big = unit.repeat(repeat);
    const path = makeTempFile(big);
    const totalChars = Array.from(big).length;
    const mid = Math.floor(totalChars / 2);
    const { content, totalChars: tc } = readTextFileWindow(path, mid, 100);
    expect(tc).toBe(totalChars);
    expect(content).toBe(Array.from(big).slice(mid, mid + 100).join(''));
  });

  // T1: LRC#3 exact-boundary regression. The first byte of a multi-byte character falls exactly on the last byte of a 64KiB physical read block;
  // before the fix, scanUtf8Chars counted the orphaned first byte into consumed, and decoding produced U+FFFD.
  it('T1 no U+FFFD when the first byte of a multi-byte character is at the end of the 64KiB boundary', () => {
    const text = `${'a'.repeat(65535)}🌍b`;
    const path = makeTempFile(text);
    const { content, charsRead } = readTextFileWindow(path, 0, 65536);
    expect(content).not.toContain('\uFFFD');
    expect(charsRead).toBe(65536);
    const codePoints = Array.from(content);
    expect(codePoints.length).toBe(65536);
    expect(codePoints[65535]).toBe('🌍');
    expect(content).toBe(`${'a'.repeat(65535)}🌍`);
  });

  // T2: second spot with the same root cause as LRC#3. The start-offset positioning loop previously used bytePos += got instead of consumed,
  // which could leave the byte pointer in the middle of a character and shift all subsequent windows.
  it('T2 windows still concatenate to the original when start falls after the 64KiB boundary', () => {
    const text = `${'a'.repeat(65535)}🌍中文尾部bcdef`;
    const path = makeTempFile(text);
    const all = Array.from(text);
    const tail = readTextFileWindow(path, 65535, 10);
    expect(tail.content).not.toContain('\uFFFD');
    expect(tail.content).toBe(all.slice(65535, 65545).join(''));

    // Read the full text window by window; the concatenation must be byte-identical to the original
    let acc = '';
    let start = 0;
    for (let guard = 0; guard < 200; guard++) {
      const { content, charsRead } = readTextFileWindow(path, start, 4096);
      acc += content;
      start += charsRead;
      if (charsRead < 4096) break;
    }
    expect(acc).toBe(text);
    expect(acc).not.toContain('\uFFFD');
  });

  // T7: the file tail is a corrupt, incomplete UTF-8 sequence (orphaned first byte). The atEof branch must keep it as-is,
  // without dropping characters or falling into an infinite loop on backtracking.
  it('T7 no infinite loop and terminates when the file tail is an incomplete UTF-8 sequence', () => {
    const broken = Buffer.concat([Buffer.from('abc中文', 'utf8'), Buffer.from([0xf0, 0x9f])]);
    const path = makeTempFile(broken);
    let start = 0;
    let guard = 0;
    let lastCharsRead = -1;
    while (guard < 50) {
      guard++;
      const { content, charsRead } = readTextFileWindow(path, start, 3);
      lastCharsRead = charsRead;
      expect(charsRead).toBe(Array.from(content).length);
      start += charsRead;
      if (charsRead < 3) break;
    }
    expect(guard).toBeLessThan(50); // no infinite loop
    expect(lastCharsRead).toBeGreaterThanOrEqual(0);
  });

  // T8: Buffer.alloc is zero-filled; if the whole buf instead of subarray(0, got) were handed to the scanner,
  // trailing 0x00 bytes would be miscounted as characters. When the window size far exceeds the file length, only real characters should be returned.
  it('T8 zero-filled characters are not returned when the window is larger than the file', () => {
    const s = '短文本abc'; // Chinese is intentional multi-byte input
    const path = makeTempFile(s);
    const { content, charsRead, totalChars } = readTextFileWindow(path, 0, 100_000);
    expect(content).toBe(s);
    expect(content).not.toContain('\u0000');
    expect(charsRead).toBe(Array.from(s).length);
    expect(totalChars).toBe(Array.from(s).length);
  });
});

describe('callMcpTool provider identity gate (LRC#1)', () => {
  const call = { name: 'local_file_read', payload: { path: '/x' } } as never;

  // T3: a third-party MCP server exposing a same-named local_file_read must not be hijacked into the Shell-specific continuation read path.
  it('T3 a same-named tool on a non-Shell server takes the generic path and does not enter auto continuation read', async () => {
    let calls = 0;
    const transport = {
      request: async () => {
        calls++;
        return {
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: 'third-party payload' }] },
        } as unknown as Awaited<ReturnType<McpProtocolTransport['request']>>;
      },
    } as unknown as McpProtocolTransport;

    const result = await callMcpTool(makeThirdPartyServer(), transport, { call } as never);
    expect(result.ok).toBe(true);
    expect(calls).toBe(1); // Only one call; the multi-window loop was not entered
    expect(result.summary).not.toContain('auto-continue');
  });

  // T4: the Shell Native Host local_file_read still enters the continuation read path; behavior does not regress.
  it('T4 local_file_read on the Shell server still enters auto continuation read', async () => {
    const transport = makeTransport([
      windowResult('AAAA', 4, 8, true),
      windowResult('BBBB', 8, 8, false),
    ]);
    const result = await callMcpTool(makeServer(), transport, { call } as never);
    expect(result.ok).toBe(true);
    expect(result.summary).toBe('local_file_read auto-continue complete');
    const t4Data = autoReadData(result);
    expect(t4Data.content).toBe('AAAABBBB');
    // Hard contract-shape assertion: data.content must be a single string rather than a per-window array, to prevent an accidental regression to contents[].
    expect(typeof t4Data.content).toBe('string');
    expect(Array.isArray(t4Data.content)).toBe(false);
  });
});

describe('callLocalFileReadAuto (extension-side auto continuation read)', () => {
  const server = makeServer();
  const call = { name: 'local_file_read', payload: { path: '/x' } } as never;

  it('loops until truncated=false, with correct aggregated content and window count', async () => {
    const transport = makeTransport([
      windowResult('AAAA', 4, 12, true),
      windowResult('BBBB', 8, 12, true),
      windowResult('CCCC', 12, 12, false),
    ]);
    const result = await callLocalFileReadAuto(server, transport, { call } as never);
    expect(result.ok).toBe(true);
    const data = autoReadData(result);
    expect(data.content).toBe('AAAABBBBCCCC');
    expect(data.windows).toBe(3);
    expect(data.totalChars).toBe(12);
    expect(data.charsReturned).toBe(12);
    expect(data.truncated).toBe(false);
  });

  it('fails closed when nextStart does not advance', async () => {
    const transport = makeTransport([
      windowResult('AAAA', 4, 12, true),
      windowResult('BBBB', 4, 12, true),
    ]);
    const result = await callLocalFileReadAuto(server, transport, { call } as never);
    expect(result.ok).toBe(false);
    expect(autoReadData(result).windows).toBe(2);
  });

  it('fails closed when window content is not a string', async () => {
    const transport = makeTransport([
      { structuredContent: { data: { truncated: true, nextStart: 4 } } } as McpCallToolResult,
    ]);
    const result = await callLocalFileReadAuto(server, transport, { call } as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed when a single window call fails', async () => {
    const transport = {
      request: async () => {
        throw new Error('boom');
      },
    } as unknown as McpProtocolTransport;
    const result = await callLocalFileReadAuto(server, transport, { call } as never);
    expect(result.ok).toBe(false);
  });

  // T5: max_chars has "maximum characters returned this time" total semantics, not a per-window limit.
  it('T5 max_chars is a total cap; the sum across windows must not exceed it', async () => {
    const { transport, requestedMaxChars } = makeBudgetAwareTransport(50_000);
    const budgetedCall = { name: 'local_file_read', payload: { path: '/x', max_chars: 5000 } } as never;
    const result = await callLocalFileReadAuto(server, transport, { call: budgetedCall } as never);
    expect(result.ok).toBe(true);
    const data = autoReadData(result);
    expect(data.charsReturned).toBe(5000);
    expect(Array.from(data.content).length).toBeLessThanOrEqual(5000);
    expect(data.truncated).toBe(true); // The file is longer; honestly marked as not fully read
    // A single-window request must not exceed the total budget, nor be inflated to 12000
    expect(Math.max(...requestedMaxChars)).toBeLessThanOrEqual(5000);
  });

  it('T5b without max_chars, the contract default total of 16000 applies', async () => {
    const { transport } = makeBudgetAwareTransport(50_000);
    const result = await callLocalFileReadAuto(server, transport, { call } as never);
    expect(result.ok).toBe(true);
    const data = autoReadData(result);
    expect(data.charsReturned).toBe(16000);
    expect(data.truncated).toBe(true);
  });

  it('T5c max_chars above the contract hard cap is clamped to 100000', async () => {
    const { transport } = makeBudgetAwareTransport(500_000);
    const hugeCall = { name: 'local_file_read', payload: { path: '/x', max_chars: 999_999 } } as never;
    const result = await callLocalFileReadAuto(server, transport, { call: hugeCall } as never);
    expect(result.ok).toBe(true);
    expect(autoReadData(result).charsReturned).toBe(100_000);
  });

  // T6: the aggregated result must still go through the unified normalization that applies the maxResultBytes byte cap.
  it('T6 aggregated detail is bounded by maxResultBytes and marked truncated', async () => {
    const tinyLimitServer = makeServer({ limits: { maxResultBytes: 500, maxToolCount: 100 } } as Partial<McpServerConfig>);
    const { transport } = makeBudgetAwareTransport(50_000);
    const result = await callLocalFileReadAuto(tinyLimitServer, transport, { call } as never);
    expect(new TextEncoder().encode(result.detail).byteLength).toBeLessThanOrEqual(500);
    expect(result.truncated).toBe(true);
  });

  it('fails closed when the window count hits the limit (does not silently misreport success)', async () => {
    // Simulates a host returning only 1 character per window while truncated stays true: the budget is ample but the window count runs out first.
    // Verifies the M1 fix: ok:false and truncated:true are required here, not a false success (fail-open).
    let i = 0;
    const transport = {
      request: async () => {
        i++;
        return {
          jsonrpc: '2.0',
          id: 1,
          result: windowResult('A', i, 12_000_000, true),
        } as unknown as Awaited<ReturnType<McpProtocolTransport['request']>>;
      },
    } as unknown as McpProtocolTransport;
    const bigBudgetCall = { name: 'local_file_read', payload: { path: '/x', max_chars: 100_000 } } as never;
    const result = await callLocalFileReadAuto(server, transport, { call: bigBudgetCall } as never);
    expect(result.ok).toBe(false);
    const data = autoReadData(result);
    expect(data.truncated).toBe(true);
    expect(data.windows).toBe(1000);
  });
});
