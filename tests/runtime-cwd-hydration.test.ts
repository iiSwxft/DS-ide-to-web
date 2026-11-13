// cwd hydration two-branch regression (responds to review #1 / second-review inline #1):
// verifies that resolveToolCallPayload derives cwd from the grant on both the "plain XML / legacy DSML" and the
// "externalized" paths (never re-trusting the call's own field), and injects nothing when no Skill grant is bound.
//
// Key constraint: cwd is derived only from getGrantLocalSkillDir(grant.id); the plain branch obtains it via the
// externalPayloadNamespace (= grant.id) emitted uniformly by the authorization layer, which is undefined without a Skill grant → no injection.

import { describe, expect, it, vi, beforeEach } from 'vitest';

const TEST_SKILL_DIR = '/skills/demo';

// Intercept authorization's getGrantLocalSkillDir before importing runtime so real state is never touched.
vi.mock('../core/tool/authorization', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/tool/authorization')>();
  return {
    ...actual,
    // P1-A (2) end-to-end: getGrantLocalSkillDir still derives cwd as grant-1 → skillDir.
    getGrantLocalSkillDir: vi.fn(async (grantId: string): Promise<string | undefined> => {
      return grantId === 'grant-1' ? TEST_SKILL_DIR : undefined;
    }),
    // End-to-end, return an authorization result carrying externalPayloadNamespace='grant-1' directly, bypassing the real grant state machine;
    // calls produced by the real parser (which may carry a wrong cwd) are passed through unchanged to resolveToolCallPayload to override.
    authorizeToolExecution: vi.fn(),
    completeToolExecutionAuthorization: vi.fn(async () => undefined),
  };
});

// P1-A (2) end-to-end: history persistence after provider execution is unrelated to this module; mock it to avoid touching real storage.
vi.mock('../core/tool/history', () => ({
  appendToolCallHistory: vi.fn(async () => undefined),
}));

import { createRuntimeToolRuntime, resolveToolCallPayload } from '../core/tool/runtime';
import { ToolProviderRegistry, type RuntimeToolProvider } from '../core/tool/provider-registry';
import type { ToolCall, ToolDescriptor, ToolResult } from '../core/tool/types';
import {
  extractToolCalls,
  LEGACY_TOOL_CALLS_OPEN_TAG,
  LEGACY_TOOL_CALLS_CLOSE_TAG,
} from '../core/interceptor/tool-parser';
import { authorizeToolExecution } from '../core/tool/authorization';

function normalCall(invocationName: string, cwd?: string): ToolCall {
  const payload: Record<string, unknown> = { command: 'ls' };
  if (cwd !== undefined) payload.cwd = cwd;
  return {
    id: 'call-1',
    descriptorId: 'local:test:sample_tool',
    name: invocationName,
    invocationName,
    payload: payload as ToolCall['payload'],
    raw: '<tool_call/>',
  };
}

describe('resolveToolCallPayload cwd hydration — normal (inline XML) branch', () => {
  it('plain shell_exec call authorized via Skill → cwd is injected as the grant skillDir', async () => {
    const call = normalCall('shell_exec');
    const out = await resolveToolCallPayload(call, 'grant-1');
    expect((out.payload as { cwd?: string }).cwd).toBe(TEST_SKILL_DIR);
  });

  it('plain shell_exec with a wrong cwd (≠ skillDir) → overridden by the grant skillDir (P1-A fix)', async () => {
    const call = normalCall('shell_exec', '/somewhere/else');
    const out = await resolveToolCallPayload(call, 'grant-1');
    // A wrong cwd no longer keeps the caller's value: it is normalized to the grant-derived skillDir to prevent execution outside the Skill directory
    expect((out.payload as { cwd?: string }).cwd).toBe(TEST_SKILL_DIR);
  });

  it('plain shell_exec with the correct cwd (=== skillDir) → idempotently keeps the caller value', async () => {
    const call = normalCall('shell_exec', TEST_SKILL_DIR);
    const out = await resolveToolCallPayload(call, 'grant-1');
    expect((out.payload as { cwd?: string }).cwd).toBe(TEST_SKILL_DIR);
  });

  it('non-command tool (local_file_read) → cwd is not injected', async () => {
    const call: ToolCall = {
      id: 'call-2',
      descriptorId: 'local:test:file_read',
      name: 'local_file_read',
      invocationName: 'local_file_read',
      payload: { rootPath: '/skills/demo', selectedPaths: ['SKILL.md'] } as ToolCall['payload'],
      raw: '<tool_call/>',
    };
    const out = await resolveToolCallPayload(call, 'grant-1');
    expect((out.payload as { cwd?: string }).cwd).toBeUndefined();
  });

  it('no Skill grant bound (externalPayloadNamespace is undefined) → cwd is not injected', async () => {
    const call = normalCall('shell_exec');
    const out = await resolveToolCallPayload(call, undefined);
    expect((out.payload as { cwd?: string }).cwd).toBeUndefined();
  });

  it('no Skill grant bound (grant has no localSkillDir) → cwd is not injected', async () => {
    const call = normalCall('shell_exec');
    const out = await resolveToolCallPayload(call, 'no-skill-grant');
    expect((out.payload as { cwd?: string }).cwd).toBeUndefined();
  });
});

describe('resolveToolCallPayload cwd hydration — externalized branch (regression)', () => {
  it('externalized payload still derives cwd from the grant (no regression; the derivation function is called)', async () => {
    const { getGrantLocalSkillDir } = await import('../core/tool/authorization');
    const spy = vi.mocked(getGrantLocalSkillDir);

    // The externalized payload needs real ref resolution; here we only confirm the externalized branch still calls the derivation function
    // (full externalized resolution is covered by tool-runtime-externalized-payload.test.ts).
    const call: ToolCall = {
      id: 'call-3',
      descriptorId: 'local:test:sample_tool',
      name: 'shell_exec',
      invocationName: 'shell_exec',
      payload: {
        ref: 'nonexistent-ref',
        invocationName: 'shell_exec',
      } as ToolCall['payload'],
      raw: '<tool_call/>',
    };
    await resolveToolCallPayload(call, 'grant-1');
    // The externalized branch must call getGrantLocalSkillDir (derive cwd), proving it has not regressed to "no injection"
    expect(spy).toHaveBeenCalledWith('grant-1');
  });
});

describe('resolveToolCallPayload cwd hydration — end-to-end parser→runtime→provider (P1-A 2)', () => {
  // The real parser parses both model output formats containing a wrong cwd (/somewhere/else), verifying that the whole chain
  // parser → executeToolCall (authorizeToolExecution → resolveToolCallPayload) → providerRegistry.execute
  // ends with the provider receiving the grant-derived skillDir rather than the untrusted cwd output by the parser.

  const shellDescriptor: ToolDescriptor = {
    id: 'local:test:shell_exec',
    provider: { kind: 'local', id: 'test', displayName: 'Test', transport: 'in_process' },
    name: 'shell_exec',
    invocationName: 'shell_exec',
    title: 'Shell exec',
    description: 'Run a shell command inside the local skill directory.',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string' }, cwd: { type: 'string' } },
      required: ['command'],
      additionalProperties: true,
    },
    execution: { mode: 'auto', enabled: true, risk: 'high' },
  };

  const xmlText = '<shell_exec>{"command":"ls","cwd":"/somewhere/else"}</shell_exec>';
  // Derive the DSML tag literals back from the real constants exported by tool-parser, ensuring they match the parsing regex characters exactly.
  const dsmlPrefix = LEGACY_TOOL_CALLS_OPEN_TAG.slice(0, -'tool_calls>'.length);
  const invokeOpen = `${dsmlPrefix}invoke name="shell_exec">`;
  // Open tags use `${dsmlPrefix}X` (dsmlPrefix = '<｜DSML｜'); closing tags use `</${dsmlPrefix.slice(1)}X>`
  // (slice(1) drops the leading '<', giving '｜DSML｜', then '</' is prepended). The two must be symmetric to be
  // matched correctly by LEGACY_INVOKE_REGEX / LEGACY_PARAMETER_REGEX. The original param closing wrongly used `</${dsmlPrefix}parameter>`,
  // which carries an extra '<' and becomes </<｜DSML｜parameter>, making the parameter sub-match fail and the payload empty — a test construction bug (not an implementation bug).
  const param = (name: string, value: string) =>
    `${dsmlPrefix}parameter name="${name}" string="true">${value}</${dsmlPrefix.slice(1)}parameter>`;
  const dsmlText =
    `${LEGACY_TOOL_CALLS_OPEN_TAG}${invokeOpen}` +
    `${param('command', 'ls')}${param('cwd', '/somewhere/else')}` +
    `</${dsmlPrefix.slice(1)}invoke>${LEGACY_TOOL_CALLS_CLOSE_TAG}`;

  beforeEach(() => {
    vi.mocked(authorizeToolExecution).mockImplementation(async (call, _context, descriptors) => ({
      call: call as ToolCall,
      descriptor:
        (descriptors as readonly ToolDescriptor[]).find(
          (d) => d.invocationName === (call as ToolCall).invocationName,
        ) ?? shellDescriptor,
      externalPayloadNamespace: 'grant-1',
      reservation: { grantId: 'grant-1', callId: (call as ToolCall).id ?? 'call-1' },
      trigger: 'manual_chat',
    }));
  });

  async function runEndToEnd(text: string): Promise<ToolCall> {
    const providerCalls: ToolCall[] = [];
    const provider: RuntimeToolProvider = {
      registration: { kind: 'local', id: 'test' },
      listTools: vi.fn(async () => [shellDescriptor]),
      execute: vi.fn(async (authorizedCall: ToolCall) => {
        providerCalls.push(authorizedCall);
        return { ok: true, summary: 'provider completed' } as ToolResult;
      }),
    };
    const runtime = createRuntimeToolRuntime(new ToolProviderRegistry([provider]));

    const parsed = extractToolCalls(text, { descriptors: [shellDescriptor] });
    expect(parsed).toHaveLength(1);
    // The parser really did output the wrong cwd supplied by the caller (proving it was untrusted before the override)
    expect((parsed[0].payload as { cwd?: string }).cwd).toBe('/somewhere/else');

    // The second argument of executeToolCall is the authorization trigger context (RuntimeToolAuthorizationContext);
    // grant info is backfilled by the mocked authorizeToolExecution via reservation.grantId, so 'manual_chat' is passed here.
    await runtime.executeToolCall(parsed[0], 'manual_chat');

    expect(provider.execute).toHaveBeenCalledTimes(1);
    expect(providerCalls).toHaveLength(1);
    return providerCalls[0];
  }

  it('end-to-end: real parser parses plain XML (with a wrong cwd) → provider receives cwd===skillDir', async () => {
    const received = await runEndToEnd(xmlText);
    expect((received.payload as { cwd?: string }).cwd).toBe(TEST_SKILL_DIR);
  });

  it('end-to-end: real parser parses legacy DSML (with a wrong cwd) → provider receives cwd===skillDir', async () => {
    const received = await runEndToEnd(dsmlText);
    expect((received.payload as { cwd?: string }).cwd).toBe(TEST_SKILL_DIR);
  });
});
