#!/usr/bin/env node
/**
 * web_search / web_fetch end-to-end simulation test
 *
 * Simulates the full flow from extracting a <web_search> tag in an AI reply, to running the search, to returning the results.
 *
 * Usage: node scripts/web-search-smoke.mjs
 */

// =========================================================================
// Step 1: Mock tool descriptors (matching the definitions in core/tool/web-search.ts)
// =========================================================================

const WEB_SEARCH_TOOL_DESCRIPTORS = [
  {
    id: 'local:web:web_search',
    provider: { kind: 'local', id: 'web', displayName: 'DeepSeek++ Web Search', transport: 'in_process' },
    name: 'web_search',
    invocationName: 'web_search',
    title: 'Search the web',
    description: 'Search the web and return page titles, URLs, and snippets relevant to the query',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query keywords' },
        topK: { type: 'integer', description: 'Number of results to return, default 5' },
      },
      required: ['query'],
    },
    execution: { mode: 'auto', enabled: true, risk: 'low' },
  },
  {
    id: 'local:web:web_fetch',
    provider: { kind: 'local', id: 'web', displayName: 'DeepSeek++ Web Search', transport: 'in_process' },
    name: 'web_fetch',
    invocationName: 'web_fetch',
    title: 'Fetch web page',
    description: 'Download the given URL and extract visible text',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Full URL' } },
      required: ['url'],
    },
    execution: { mode: 'manual', enabled: true, risk: 'medium' },
  },
];

const MEMORY_TOOL_DESCRIPTORS = [
  {
    id: 'local:memory:memory_save',
    provider: { kind: 'local', id: 'memory', displayName: 'DeepSeek++ Memory', transport: 'in_process' },
    name: 'memory_save', invocationName: 'memory_save', title: 'Save memory', description: 'Save long-term memory',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    execution: { mode: 'auto', enabled: true, risk: 'low' },
  },
];

// All tool descriptors (mock of DEFAULT_TOOL_DESCRIPTORS)
const ALL_DESCRIPTORS = [...MEMORY_TOOL_DESCRIPTORS, ...WEB_SEARCH_TOOL_DESCRIPTORS];

// =========================================================================
// Step 2: Mock extractToolCalls (matching the logic in core/tool/invocation.ts)
// =========================================================================

function createInvocationCatalog(descriptors) {
  const descriptorByInvocationName = new Map();
  for (const d of descriptors) {
    const name = d.invocationName.trim();
    if (!descriptorByInvocationName.has(name)) {
      descriptorByInvocationName.set(name, d);
    }
  }
  return {
    descriptors,
    invocationNames: [...descriptorByInvocationName.keys()],
    descriptorByInvocationName,
  };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createXmlToolCallRegex(catalog) {
  if (catalog.invocationNames.length === 0) return /$a/g;
  const names = catalog.invocationNames.map(escapeRegExp).join('|');
  return new RegExp(`<(${names})>\\s*([\\s\\S]*?)\\s*<\\/\\1>`, 'g');
}

function extractToolCalls(text, descriptors) {
  const catalog = createInvocationCatalog(descriptors);
  const regex = createXmlToolCallRegex(catalog);
  const calls = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const invocationName = match[1];
    const body = match[2].trim();
    const descriptor = catalog.descriptorByInvocationName.get(invocationName);
    let payload = {};
    try { payload = body.length === 0 ? {} : JSON.parse(body); } catch {}
    calls.push({
      name: descriptor?.name ?? invocationName,
      invocationName,
      payload,
      raw: match[0],
      descriptorId: descriptor?.id,
      provider: descriptor?.provider,
      createdAt: Date.now(),
    });
  }
  return calls;
}

// =========================================================================
// Step 3: Mock performWebSearch (matching the logic in core/tool/web-search.ts)
// =========================================================================

function createSearchResult(title, url, snippet) {
  return { title, url, snippet };
}

function parseBingResults(html, topK) {
  const results = [];
  const algoRegex = /<li[^>]*class="[^"]*\bb_algo\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = algoRegex.exec(html)) !== null && results.length < topK) {
    const block = match[1];
    const titleLink = /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i.exec(block);
    if (!titleLink) continue;
    let url = titleLink[1];
    const title = titleLink[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (url.startsWith('//')) url = 'https:' + url;
    const captionBlock = /<div[^>]*class="[^"]*\bb_caption\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    let snippet = '';
    if (captionBlock) {
      const paraText = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(captionBlock[1]);
      snippet = paraText
        ? paraText[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        : captionBlock[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }
    if (title && url) results.push(createSearchResult(title, url, snippet));
  }
  return results.slice(0, topK);
}

async function performWebSearch(query, topK) {
  const domains = ['cn.bing.com', 'www.bing.com'];
  let lastError = null;

  for (const domain of domains) {
    try {
      const url = `https://${domain}/search?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`${domain} returned status ${response.status}`);
      const html = await response.text();
      if (html.length < 200) throw new Error(`${domain} returned empty response`);
      const results = parseBingResults(html, topK);
      if (results.length === 0) throw new Error(`${domain} returned no parseable search results`);
      return { ok: true, summary: `Search complete, found ${results.length} results`, results, domain, status: response.status };
    } catch (e) {
      lastError = e.message;
    }
  }
  return { ok: false, summary: 'Search failed', error: lastError };
}

// =========================================================================
// Step 4: Mock buildContinuationPrompt (matching the logic in core/inline-agent/prompt.ts)
// =========================================================================

function buildContinuationPrompt(originalTask, executions) {
  const results = executions.map((e) => ({
    tool: e.name,
    provider: e.provider?.displayName,
    ok: e.result.ok,
    summary: e.result.summary,
    detail: e.result.detail?.slice(0, 4000),
    output: e.result.output ? JSON.stringify(e.result.output).slice(0, 8000) : undefined,
  }));
  return [
    'These are the tool results just executed by the tool continuation task. Continue based on the original task and these tool results.',
    '',
    '<original_task>',
    originalTask.slice(0, 8000),
    '</original_task>',
    '',
    '<tool_results>',
    JSON.stringify(results, null, 2),
    '</tool_results>',
  ].join('\n');
}

// =========================================================================
// Main test flow
// =========================================================================

let passed = 0;
let failed = 0;

function check(ok, msg) {
  if (ok) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

async function main() {
  console.log('========================================');
  console.log('  web_search end-to-end simulation test');
  console.log('========================================\n');

  // ── Test 1: Extract tool calls from a mock AI reply ──
  console.log('=== Test 1: Tool call extraction ===');

  const mockAiResponse = `Sure, let me search for information about this YouTuber.

<web_search>
{"query": "Orange Crow YouTuber"}
</web_search>

Please wait; once the search completes I will organize the results for you.`;

  const calls = extractToolCalls(mockAiResponse, ALL_DESCRIPTORS);
  check(calls.length === 1, `Extracted ${calls.length} tool call(s) from the AI reply (expected 1)`);
  if (calls.length > 0) {
    const call = calls[0];
    check(call.name === 'web_search', `Tool name: ${call.name}`);
    check(call.payload.query === 'Orange Crow YouTuber', `Query parameter: ${call.payload.query}`);
    check(call.provider?.id === 'web', `provider.id = ${call.provider?.id}`);
    check(call.provider?.kind === 'local', `provider.kind = ${call.provider?.kind}`);
  }

  // ── Test 2: Multiple tool calls at once ──
  console.log('\n=== Test 2: Mixed tool calls ===');
  const mixedResponse = `Got it, I will remember that.

<memory_save>
{"name": "User preference", "content": "Likes tech videos"}
</memory_save>

Let me search for more information.

<web_search>
{"query": "Orange Crow tech YouTuber"}
</web_search>` ;

  const mixedCalls = extractToolCalls(mixedResponse, ALL_DESCRIPTORS);
  check(mixedCalls.length === 2, `Extracted ${mixedCalls.length} tool call(s) (expected 2)`);
  check(mixedCalls[0].name === 'memory_save', `First tool: ${mixedCalls[0].name}`);
  check(mixedCalls[1].name === 'web_search', `Second tool: ${mixedCalls[1].name}`);
  check(mixedCalls[1].provider?.id === 'web', `web_search provider.id = ${mixedCalls[1].provider?.id}`);

  // ── Test 3: Mock stripToolCalls (remove XML tags from text) ──
  console.log('\n=== Test 3: Tool call tag stripping ===');
  const catalog = createInvocationCatalog(ALL_DESCRIPTORS);
  const regex = createXmlToolCallRegex(catalog);
  const stripped = mockAiResponse.replace(regex, '').replace(/\n{3,}/g, '\n\n').trim();
  const expected = 'Sure, let me search for information about this YouTuber.\n\nPlease wait; once the search completes I will organize the results for you.';
  check(stripped === expected, `Stripped text is correct\n  Expected: ${expected.slice(0, 40)}...\n  Actual: ${stripped.slice(0, 40)}...`);

  // ── Test 4 (online): Run an actual search ──
  console.log('\n=== Test 4: Actual search execution ===');
  try {
    const result = await performWebSearch('Orange Crow YouTuber', 5);
    if (result.ok) {
      check(true, `Search succeeded: ${result.summary} (${result.domain}, HTTP ${result.status})`);
      result.results.forEach((r, i) => {
        console.log(`     ${i+1}. ${r.title.slice(0, 50)}`);
      });
    } else {
      check(false, `Search failed: ${result.error}`);
    }
  } catch (e) {
    check(false, `Search error: ${e.message}`);
  }

  // ── Test 5 (online): Validate the ToolResult format of search results ──
  console.log('\n=== Test 5: ToolResult format validation ===');
  try {
    const result = await performWebSearch('Orange Crow YouTuber', 3);
    if (result.ok) {
      // Mock returned ToolResult (matching executeWebSearchToolCall)
      const toolResult = {
        ok: true,
        name: 'web_search',
        summary: result.summary,
        detail: result.results.map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}`).join('\n'),
        output: result.results,
      };
      check(toolResult.ok === true, `ok = ${toolResult.ok}`);
      check(toolResult.name === 'web_search', `name = ${toolResult.name}`);
      check(Array.isArray(toolResult.output), `output is an array: ${Array.isArray(toolResult.output)}`);
      check(toolResult.output.length <= 3, `output length ${toolResult.output.length} <= 3`);
      check(typeof toolResult.detail === 'string', `detail is a string`);
      check(toolResult.detail.length > 0, `detail is non-empty`);
    } else {
      check(false, `Search failed, skipping ToolResult validation: ${result.error}`);
    }
  } catch (e) {
    check(false, `ToolResult validation error: ${e.message}`);
  }

  // ── Test 6: Mock Continuation Prompt generation ──
  console.log('\n=== Test 6: Continuation Prompt generation ===');
  const mockExecutions = [{
    name: 'web_search',
    provider: { kind: 'local', id: 'web', displayName: 'DeepSeek++ Web Search' },
    result: {
      ok: true,
      summary: 'Search complete, found 5 results',
      detail: '1. [Result one](https://example.com)\n   Summary content',
      output: [{ title: 'Result one', url: 'https://example.com', snippet: 'Summary content' }],
    },
  }];
  const continuationPrompt = buildContinuationPrompt('Help me search for Orange Crow YouTuber', mockExecutions);
  check(continuationPrompt.includes('<original_task>'), 'Contains original_task');
  check(continuationPrompt.includes('<tool_results>'), 'Contains tool_results');
  check(continuationPrompt.includes('Orange Crow YouTuber'), 'Contains the original query');
  check(continuationPrompt.includes('Result one'), 'Contains the search results');
  check(continuationPrompt.includes('</tool_results>'), 'Closes correctly');

  // ── Summary ──
  const total = passed + failed;
  console.log(`\n========================================`);
  console.log(`  Result: ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(`  ${failed} failed`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('\nUncaught error:', e);
  process.exit(1);
});
