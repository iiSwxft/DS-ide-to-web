// Unit tests for the local Skill cwd "initial cwd hint" (Review #4, route A):
//   1) enforceLocalSkillCwd is a pure function: it only normalizes cwd=skillDir at the "initial cwd" level for shell_exec / shell_session_begin.
//   2) parseExternalizedToolPayload landing point: when skillDir is passed, the "initial cwd" of command-style tools is normalized.
//   3) Self-consistent contract: this layer only sets the initial cwd and does not persistently bind the session (persistent-session cwd reuse is handled by the existing shell session registry semantics).
//   4) A3 fix: shell_session_exec is not in the normalized set (its cwd is held by the session registry, contracts.ts:80-84), so no cwd is injected.

import { describe, expect, it } from 'vitest';
import { enforceLocalSkillCwd, isCwdEnforcedInvocation } from '../core/tool/local-skill-cwd';
import { parseExternalizedToolPayload } from '../core/tool/externalized-payload';

describe('enforceLocalSkillCwd', () => {
  it('shell_exec without cwd -> forced to skillDir', () => {
    const out = enforceLocalSkillCwd({ command: 'ls' }, 'shell_exec', '/skills/demo');
    expect(out.cwd).toBe('/skills/demo');
  });

  it('shell_exec with a wrong cwd (!= skillDir) -> overridden by the granted skillDir (Review #2 #7 P1 fix)', () => {
    const payload = { command: 'ls', cwd: '/somewhere/else' };
    const out = enforceLocalSkillCwd(payload, 'shell_exec', '/skills/demo');
    expect(out).not.toBe(payload);
    expect(out.cwd).toBe('/skills/demo');
  });

  it('shell_exec cwd already equal to skillDir -> returned as-is (not copied)', () => {
    const payload = { command: 'ls', cwd: '/skills/demo' };
    const out = enforceLocalSkillCwd(payload, 'shell_exec', '/skills/demo');
    expect(out).toBe(payload);
  });

  it('empty skillDir -> payload unchanged', () => {
    const payload = { command: 'ls' };
    expect(enforceLocalSkillCwd(payload, 'shell_exec', '')).toBe(payload);
    expect(enforceLocalSkillCwd(payload, 'shell_exec', undefined)).toBe(payload);
  });

  it('local_file_read (no cwd semantics) -> not enforced', () => {
    const payload = { rootPath: '/skills/demo', selectedPaths: ['SKILL.md'] };
    const out = enforceLocalSkillCwd(payload, 'local_file_read', '/skills/demo');
    expect(out.cwd).toBeUndefined();
    expect(out.rootPath).toBe('/skills/demo');
  });

  it('isCwdEnforcedInvocation only covers initial command-style tools (A3 fix: shell_session_exec is not normalized)', () => {
    expect(isCwdEnforcedInvocation('shell_exec')).toBe(true);
    expect(isCwdEnforcedInvocation('shell_session_begin')).toBe(true);
    // A3 fix: shell_session_exec reuses the session's existing cwd (contracts.ts:80-84 explicitly does not accept a cwd field),
    // so it is no longer in the normalized set, avoiding a violation of the public contract.
    expect(isCwdEnforcedInvocation('shell_session_exec')).toBe(false);
    expect(isCwdEnforcedInvocation('local_file_read')).toBe(false);
    expect(isCwdEnforcedInvocation('local_skill_preview')).toBe(false);
  });
});

describe('parseExternalizedToolPayload cwd enforcement point', () => {
  it('shell_exec parsed with skillDir -> cwd is enforced', () => {
    const { payload, parseError } = parseExternalizedToolPayload(
      '{"command":"ls"}',
      'shell_exec',
      '/skills/demo',
    );
    expect(parseError).toBeUndefined();
    expect(payload?.cwd).toBe('/skills/demo');
  });

  it('no skillDir passed -> cwd is not enforced (keeps the Agent original value or stays absent)', () => {
    const { payload } = parseExternalizedToolPayload('{"command":"ls"}', 'shell_exec');
    expect(payload?.cwd).toBeUndefined();
  });

  it('local_file_read does not enforce cwd', () => {
    const { payload } = parseExternalizedToolPayload(
      '{"rootPath":"/skills/demo"}',
      'local_file_read',
      '/skills/demo',
    );
    expect(payload?.cwd).toBeUndefined();
  });

  it('shell_exec parsed with a wrong cwd (!= skillDir) -> overridden with skillDir (Review #2 #7 P1 fix, parser->runtime path)', () => {
    const { payload, parseError } = parseExternalizedToolPayload(
      '{"command":"ls","cwd":"/somewhere/else"}',
      'shell_exec',
      '/skills/demo',
    );
    expect(parseError).toBeUndefined();
    expect(payload?.cwd).toBe('/skills/demo');
  });
});

describe('Self-consistent contract (Review #4, route A): initial cwd hint only, no persistent session binding', () => {
  it('enforceLocalSkillCwd normalizes a "wrong cwd (!= skillDir)" to the granted skillDir (Review #2 #7 P1 fix)', () => {
    const original = { command: 'ls', cwd: '/somewhere/else' };
    const out = enforceLocalSkillCwd(original, 'shell_exec', '/skills/demo');
    expect(out).not.toBe(original);
    expect(out.cwd).toBe('/skills/demo');
    expect(original.cwd).toBe('/somewhere/else');
  });

  it('enforceLocalSkillCwd injects skillDir for a "missing cwd" without mutating the original object', () => {
    const original: { command: string; cwd?: string } = { command: 'ls' };
    const out = enforceLocalSkillCwd(original, 'shell_exec', '/skills/demo');
    expect(out.cwd).toBe('/skills/demo');
    expect(original.cwd).toBeUndefined();
  });

  it('shell_session_exec (session follow-up command) does not normalize cwd (A3 fix, contracts.ts:80-84)', () => {
    const payload = { command: 'ls', sessionId: 's1', cwd: '/somewhere/else' };
    // A3 fix: shell_session_exec is not in CWD_ENFORCED_INVOCATIONS and its cwd is held by the session registry;
    // the caller-supplied cwd is kept as-is (not forced to skillDir), avoiding a violation of the public contract.
    expect(isCwdEnforcedInvocation('shell_session_exec')).toBe(false);
    const out = enforceLocalSkillCwd(payload, 'shell_session_exec', '/skills/demo');
    expect(out).toBe(payload);
    expect(out.cwd).toBe('/somewhere/else');
  });
});

describe('Module E: A3 counter-regression (C1-C3, shell_session_exec does not inject cwd)', () => {
  it('C1: isCwdEnforcedInvocation does not include shell_session_exec', () => {
    expect(isCwdEnforcedInvocation('shell_session_exec')).toBe(false);
  });

  it('C2: initial command-style calls shell_exec / shell_session_begin still normalize cwd', () => {
    expect(isCwdEnforcedInvocation('shell_exec')).toBe(true);
    expect(isCwdEnforcedInvocation('shell_session_begin')).toBe(true);
  });

  it('C3: shell_session_exec cwd is kept as-is (not forced to skillDir, contracts.ts:80-84)', () => {
    const payload = { command: 'ls', sessionId: 's1', cwd: '/somewhere/else' };
    const out = enforceLocalSkillCwd(payload, 'shell_session_exec', '/skills/demo');
    expect(out).toBe(payload);
    expect(out.cwd).toBe('/somewhere/else');
  });

  it('C3 addendum: a wrong cwd is still normalized by shell_exec (regression guard R3)', () => {
    const payload = { command: 'ls', cwd: '/somewhere/else' };
    const out = enforceLocalSkillCwd(payload, 'shell_exec', '/skills/demo');
    expect(out.cwd).toBe('/skills/demo');
  });
});
