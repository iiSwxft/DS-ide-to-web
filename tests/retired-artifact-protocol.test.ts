import { describe, expect, it } from 'vitest';
import { stripRetiredArtifactProtocolBlocks } from '../core/inline-agent/retired-artifact';

describe('stripRetiredArtifactProtocolBlocks', () => {
  it('strips a complete artifact_create block including its JSON body', () => {
    const text = [
      'I have finished the analysis.',
      '',
      '<artifact_create>{"filename":"report.html","content":"<h1>Summary</h1>","language":"html"}</artifact_create>',
    ].join('\n');

    expect(stripRetiredArtifactProtocolBlocks(text)).toBe('I have finished the analysis.\n\n');
  });

  it('strips artifact_bundle_create blocks', () => {
    const text = [
      'before',
      '<artifact_bundle_create>{"filename":"project.zip","files":[{"path":"a.html","content":"A"}]}</artifact_bundle_create>',
      'after',
    ].join('\n');

    expect(stripRetiredArtifactProtocolBlocks(text)).toBe('before\n\nafter');
  });

  it('strips multiple blocks, keeping the surrounding text', () => {
    const text = [
      'head',
      '<artifact_create>{"filename":"a.html","content":"A"}</artifact_create>',
      'middle',
      '<artifact_create>{"filename":"b.html","content":"B"}</artifact_create>',
      'tail',
    ].join('\n');

    expect(stripRetiredArtifactProtocolBlocks(text)).toBe('head\n\nmiddle\n\ntail');
  });

  it('drops the remainder of an unclosed trailing block (clamped stream)', () => {
    const text = 'Body text.\n<artifact_create>{"filename":"report.html","content":"<html>truncated';

    expect(stripRetiredArtifactProtocolBlocks(text)).toBe('Body text.\n');
  });

  it('never touches fenced code blocks, even with artifact-looking content', () => {
    const fences = [
      '```html',
      '<h1>Hi</h1>',
      '```',
      '',
      '```xychart-beta',
      'line [1, 2, 3]',
      '```',
    ].join('\n');

    expect(stripRetiredArtifactProtocolBlocks(fences)).toBe(fences);
  });

  it('never touches other tool XML (active catalog tools stay for the tool strip)', () => {
    const text = 'before\n<web_search>{"query":"x"}</web_search>\nafter';
    expect(stripRetiredArtifactProtocolBlocks(text)).toBe(text);
  });

  it('never touches plain text without artifact tags (same reference)', () => {
    const text = 'A plain final answer with no protocol blocks.';
    expect(stripRetiredArtifactProtocolBlocks(text)).toBe(text);
  });

  it('handles whitespace inside artifact tags via the shared XML scanner', () => {
    const text = 'a< artifact_create >{"filename":"f.txt","content":"x"}< / artifact_create >b';
    expect(stripRetiredArtifactProtocolBlocks(text)).toBe('ab');
  });

  it('leaves HTML content embedded in JSON inside a block (the whole block is protocol)', () => {
    const text = [
      'p1',
      '<artifact_create>{"filename":"chart.html","content":"<svg><line/></svg>","language":"html"}</artifact_create>',
      'p2',
    ].join('\n');

    expect(stripRetiredArtifactProtocolBlocks(text)).toBe('p1\n\np2');
  });

  it('keeps artifact tags inside fenced code blocks (example content, not protocol)', () => {
    // A model showing the retired syntax inside a ```fence``` is teaching
    // content: the tag and its surroundings pass through byte-for-byte.
    const text = [
      'Here is an example of the old protocol:',
      '```xml',
      '<artifact_create>{"filename":"a.html","content":"A"}</artifact_create>',
      '```',
      'That was the example.',
    ].join('\n');

    expect(stripRetiredArtifactProtocolBlocks(text)).toBe(text);
  });

  it('does not drop the remainder after an unclosed artifact tag inside a fence', () => {
    const text = [
      '```html',
      'See the old tag <artifact_create>, now deprecated',
      'Real content follows',
      '```',
      'The final answer is kept.',
    ].join('\n');

    expect(stripRetiredArtifactProtocolBlocks(text)).toBe(text);
  });

  it('still strips outside-fence blocks after a closed fence', () => {
    const text = [
      '```html',
      '<artifact_create>{"filename":"a.html","content":"A"}</artifact_create>',
      '```',
      '<artifact_create>{"filename":"b.html","content":"B"}</artifact_create>',
      'The end.',
    ].join('\n');

    expect(stripRetiredArtifactProtocolBlocks(text)).toBe(
      [
        '```html',
        '<artifact_create>{"filename":"a.html","content":"A"}</artifact_create>',
        '```',
        '',
        'The end.',
      ].join('\n'),
    );
  });

  it('handles an unterminated fence: tags inside it stay visible', () => {
    const text = [
      '```html',
      '<artifact_create>{"filename":"a.html","content":"A"}</artifact_create>',
    ].join('\n');

    expect(stripRetiredArtifactProtocolBlocks(text)).toBe(text);
  });
});
