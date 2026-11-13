import { describe, expect, it } from 'vitest';
import { renderInlineMarkdown } from '../core/inline-agent/markdown';

describe('renderInlineMarkdown', () => {
  it('does not create anchors for unsafe protocols', () => {
    const html = renderInlineMarkdown('[run](javascript:alert(1))');

    expect(html).not.toContain('<a ');
    expect(html).toContain('run');
  });

  it('escapes safe href attributes', () => {
    const html = renderInlineMarkdown('[docs](https://example.com/?q=a&b=c)');

    expect(html).toContain('<a href="https://example.com/?q=a&amp;b=c"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('renders markdown tables before newline conversion', () => {
    const html = renderInlineMarkdown([
      '| Metric | Value |',
      '| --- | --- |',
      '| **Average price** | About **47k** CNY/sqm |',
    ].join('\n'));

    expect(html).toContain('<table>');
    expect(html).toContain('<th>Metric</th>');
    expect(html).toContain('<td><strong>Average price</strong></td>');
    expect(html).toContain('<td>About <strong>47k</strong> CNY/sqm</td>');
    expect(html).not.toContain('| --- |');
  });

  it('does not parse markdown tables inside fenced code blocks', () => {
    const html = renderInlineMarkdown([
      '```',
      '| a | b |',
      '| --- | --- |',
      '```',
    ].join('\n'));

    expect(html).toContain('<pre><code>| a | b |');
    expect(html).not.toContain('<table>');
  });

  it('renders agent-mode lists and paragraphs as compact block elements', () => {
    // DeepSeek agent mode separates every list item / sentence with \n\n.
    // Blank lines must be structural separators (block spacing comes from CSS
    // margins), never a <br> stacked next to a block element — that renders
    // an empty row between every paragraph/list item (the "blank line between
    // every row" rendering bug).
    const html = renderInlineMarkdown([
      'I have now gathered enough search results. Let me distill the most important tech news from them.',
      '',
      'From the search results, I can see several major tech stories that day:',
      '',
      "1. Envision Group's Ulanqab Galaxy base has gone into production.",
      '',
      "2. Google's AI division undergoes a major reorganization.",
      '',
      '3. Xinhua reported on some tech progress in China.',
    ].join('\n'));

    expect(html).not.toContain('<br><br>');
    // Paragraphs are <p> blocks; blank lines produce no <br> at all.
    expect(html).not.toContain('<br>');
    expect(html).toContain('</p><p>From the search results, I can see several major tech stories that day:</p>');
    // Ordered list rows wrap in one <ol> (native markdown semantics), with no
    // <br> between items.
    expect(html).toContain("<ol><li>Envision Group's Ulanqab Galaxy base has gone into production.</li><li>Google's AI division undergoes a major reorganization.</li><li>Xinhua reported on some tech progress in China.</li></ol>");
  });

  it('preserves intentional single line breaks inside fenced code blocks', () => {
    const html = renderInlineMarkdown([
      '```',
      'line one',
      '',
      'line two',
      '```',
    ].join('\n'));

    expect(html).toContain('<pre><code>line one\n\nline two\n</code></pre>');
    expect(html).not.toContain('<br><br>');
  });

  it('collapses blank lines when the model output uses CRLF line endings', () => {
    // \r\n\r\n must be collapsed just like \n\n — the \r characters must not
    // defeat the blank-line collapse and re-introduce blank rows.
    const html = renderInlineMarkdown([
      'First line.',
      '',
      'Second line.',
      '',
      'Third line.',
    ].join('\r\n'));

    expect(html).not.toContain('<br><br>');
    expect(html).not.toContain('\r');
    expect(html).not.toContain('<br>');
    expect(html).toContain('<p>First line.</p><p>Second line.</p><p>Third line.</p>');
  });

  it('renders agent-mode ATX headings with the correct level', () => {
    // DeepSeek agent-mode final answers use `####` sub-headings; the page's
    // own markdown renderer renders them as headings, so the inline agent
    // panel must match (Issue: agent panel blank-line rendering).
    const html = renderInlineMarkdown([
      'V. Core contest: three major contradictions',
      '',
      '#### 1. 🟢 Cloud computing supercycle vs. 🔴 Massive capex',
      'Google Cloud grew 82% year over year, backlog $514 billion, operating margin 35.6%',
      '',
      'But capex doubled to the $200 billion level and free cash flow turned negative',
      '',
    ].join('\n'));

    expect(html).toContain('<h4>1. 🟢 Cloud computing supercycle vs. 🔴 Massive capex</h4>');
    // Block elements are siblings — no <br> stacked on <h4> (that double line
    // break is the "blank line between every row" rendering bug).
    expect(html).toContain('</p><h4>1. 🟢 Cloud computing supercycle vs. 🔴 Massive capex</h4>');
    expect(html).toContain('</h4><p>Google Cloud grew 82%');
    expect(html).not.toContain('#### 1.');
    expect(html).not.toContain('<br>');
  });

  it('renders ordered and unordered list items', () => {
    const html = renderInlineMarkdown([
      'Key points:',
      '',
      '1. First point.',
      '2. Second point.',
      '',
      '- Addition one.',
      '- Addition two.',
    ].join('\n'));

    expect(html).toContain('<li>First point.</li>');
    expect(html).toContain('<li>Second point.</li>');
    expect(html).toContain('<li>Addition one.</li>');
    expect(html).toContain('<li>Addition two.</li>');
    expect(html).not.toContain('1. First point');
    expect(html).not.toContain('- Addition one');
  });

  it('renders blockquote lines', () => {
    const html = renderInlineMarkdown('> Quoted content.\n\nBody.');

    expect(html).toContain('<blockquote>Quoted content.</blockquote>');
    expect(html).toContain('Body.');
  });

  it('renders 4-backtick fences and keeps 3-backtick runs as content', () => {
    // 4-backtick outer fences let the content contain standard ``` fences.
    // Code content is HTML-escaped and the fence language is preserved for
    // the agent console's incremental run support.
    const html = renderInlineMarkdown([
      '````html',
      '<div>partial</div>',
      '```',
      'inner',
      '```',
      '````',
    ].join('\n'));

    expect(html).toContain('<pre data-dpp-lang="html"><code>&lt;div&gt;partial&lt;/div&gt;\n```\ninner\n```\n</code></pre>');
    // No leftover raw fences.
    expect(html).not.toContain('````');
    expect(html).not.toContain('<table>');
  });

  it('auto-closes an unterminated trailing fence', () => {
    // Streaming cuts and 100k-clamped persisted answers can end mid-block; the
    // partial content renders as a code block instead of leaking backticks.
    const html = renderInlineMarkdown('```html\n<div>partial');

    expect(html).toContain('<pre data-dpp-lang="html"><code>&lt;div&gt;partial</code></pre>');
    expect(html).not.toContain('```');
  });

  it('keeps a lone trailing fence without content literal', () => {
    const html = renderInlineMarkdown('text\n```');

    expect(html).not.toContain('<pre>');
    expect(html).toContain('text');
  });
  it('recognizes hyphenated fence languages without nesting later blocks', () => {
    const html = renderInlineMarkdown([
      '```xychart-beta',
      'title First',
      'line [1, 2]',
      '```',
      '',
      'between',
      '',
      '```xychart-beta',
      'title Second',
      'bar [2, 1]',
      '```',
    ].join('\n'));

    expect(html.match(/<pre data-dpp-lang="xychart-beta">/g)).toHaveLength(2);
    expect(html).toContain('<p>between</p>');
    expect(html).not.toContain('```xychart-beta');
  });

  it('can omit closed and streaming native fences while preserving surrounding text', () => {
    const nativeLanguages = new Set(['html', 'xychart-beta']);
    const complete = renderInlineMarkdown([
      'before',
      '````HTML',
      '<div>native</div>',
      '```',
      'still code',
      '````',
      'after',
      '```js',
      'console.log(1)',
      '```',
    ].join('\n'), { omitFencedCodeLanguages: nativeLanguages });

    expect(complete).toContain('<p>before</p>');
    expect(complete).toContain('<p>after</p>');
    expect(complete).not.toContain('&lt;div&gt;native&lt;/div&gt;');
    expect(complete).not.toContain('still code');
    expect(complete).toContain('<pre data-dpp-lang="js"><code>console.log(1)\n</code></pre>');

    const streaming = renderInlineMarkdown(
      'before\n```xychart-beta\ntitle Partial\nline [1',
      { omitFencedCodeLanguages: nativeLanguages },
    );
    expect(streaming).toBe('<p>before</p>');
    expect(streaming).not.toContain('<pre');
  });

});
