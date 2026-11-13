import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from './config.mjs';

/**
 * DeepSeek's web chat has no "system" role, so instructions for a new chat are
 * sent inside its first message, clearly separated from the actual prompt.
 */
export const PRESETS = {
  collaborator:
    'You are DeepSeek, working in a back-and-forth with another AI assistant. An automated bridge relays that ' +
    "assistant's messages to you and returns your replies to it, so write for another AI, not a human. " +
    'Be concrete and concise. State your assumptions. Answer exactly what was asked, then list open questions or ' +
    'the next step you suggest. If you disagree with something, say why and propose an alternative. ' +
    'Do not repeat the other assistant back to itself.',
  reviewer:
    'You are a careful reviewer. The text you receive comes from another AI assistant. Find real problems: ' +
    'bugs, wrong assumptions, missing cases, unclear reasoning. Rank them by severity, quote the part you mean, ' +
    'and give a concrete fix for each. If something is fine, say so briefly instead of inventing issues.',
  director:
    'You are a prompt director in a loop with another AI, the worker. You never do the task yourself. ' +
    'The worker runs your prompts and sends you what it produced.\n\n' +
    'Each turn the worker gives you the goal and, after the first turn, the output of your last prompt. ' +
    'Reply in exactly this format and nothing else:\n\n' +
    'ASSESSMENT: one to three sentences on what the last output got right and what is missing or wrong. ' +
    '(On the first turn write: First turn.)\n' +
    'NEXT PROMPT:\n' +
    '<<<\n' +
    'the complete prompt for the worker to run next\n' +
    '>>>\n\n' +
    'When the output meets the goal, reply with only:\n' +
    'DONE: one sentence on why it is good enough.\n\n' +
    'Rules: write prompts the worker can run without seeing this conversation, and make them self-contained, ' +
    'specific about the deliverable, its format and length. Change one thing per round and aim at the single ' +
    'biggest gap. Be concrete, not generic. Never ask the worker to do anything destructive or outside the stated goal.',
  concise:
    'Answer as briefly as possible while staying correct. No preamble, no restating the question.',
};

export function presetNames() {
  return Object.keys(PRESETS);
}

/** Default instructions for every new chat: DS_BRIDGE_SYSTEM, else ~/.ds-ide-to-web/system.txt, else none. */
export function defaultSystem() {
  if (process.env.DS_BRIDGE_SYSTEM) return process.env.DS_BRIDGE_SYSTEM.trim();
  const file = join(configDir(), 'system.txt');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  return '';
}

/**
 * Pick the instructions for a new chat, most specific first:
 * explicit text > named preset > the extension popup's prompt > DS_BRIDGE_SYSTEM / system.txt.
 */
export function pickSystem({ system, preset, extensionSystem } = {}) {
  if (typeof system === 'string' && system.trim()) return system.trim();
  if (preset) {
    const text = PRESETS[preset];
    if (!text) throw new Error(`Unknown preset "${preset}". Available: ${presetNames().join(', ')}`);
    return text;
  }
  if (typeof extensionSystem === 'string' && extensionSystem.trim()) return extensionSystem.trim();
  return defaultSystem();
}

export function withSystem(system, prompt) {
  if (!system) return prompt;
  return `[Instructions for this whole conversation. Follow them in every reply.]\n${system}\n\n[First message]\n${prompt}`;
}
