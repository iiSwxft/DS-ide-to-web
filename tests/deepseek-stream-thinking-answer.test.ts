import { describe, expect, it } from 'vitest';
import {
  consumeDeepSeekSseEvents,
  createDeepSeekStreamSummary,
} from '../core/deepseek/stream-codec';

function run(events: unknown[]) {
  const summary = createDeepSeekStreamSummary();
  consumeDeepSeekSseEvents(
    events.map((event) => ({ type: 'message', data: JSON.stringify(event) })),
    summary,
  );
  return summary;
}

describe('thinking stream answer fragment', () => {
  it('captures the RESPONSE fragment delivered via a fragment-list replacement', () => {
    const summary = run([
      { v: { response: { message_id: 2, fragments: [{ id: 2, type: 'THINK', content: 'We' }] } } },
      { p: 'response/fragments/-1/content', o: 'APPEND', v: ' think' },
      { v: ' more' },
      {
        p: 'response/fragments',
        v: [
          { id: 2, type: 'THINK', content: 'We think more' },
          { id: 3, type: 'RESPONSE', content: '391' },
        ],
      },
      { p: 'response/status', o: 'SET', v: 'FINISHED' },
    ]);
    expect(summary.assistantReasoningText).toBe('We think more');
    expect(summary.assistantText).toBe('391');
    expect(summary.finished).toBe(true);
  });

  it('does not re-emit fragments that were already streamed', () => {
    const summary = run([
      { v: { response: { message_id: 2, fragments: [{ id: 2, type: 'RESPONSE', content: 'Hi' }] } } },
      { p: 'response/fragments', v: [{ id: 2, type: 'RESPONSE', content: 'Hi' }] },
    ]);
    expect(summary.assistantText).toBe('Hi');
  });
});
