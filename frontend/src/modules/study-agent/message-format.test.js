import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline } from './message-format.js';

describe('message-format', () => {
  it('parses bold, code and citation markers inline', () => {
    expect(parseInline('Use **joins** with `JOIN` [1] today')).toEqual([
      { type: 'text', value: 'Use ' },
      { type: 'bold', value: 'joins' },
      { type: 'text', value: ' with ' },
      { type: 'code', value: 'JOIN' },
      { type: 'text', value: ' ' },
      { type: 'cite', value: 1 },
      { type: 'text', value: ' today' },
    ]);
  });

  it('leaves unmatched markers as plain text', () => {
    expect(parseInline('a ** b `c')).toEqual([{ type: 'text', value: 'a ** b `c' }]);
  });

  it('groups paragraphs, lists, headings and fenced code into blocks', () => {
    const blocks = parseBlocks(
      ['## Joins', 'Intro line', 'second line', '', '- one', '- two', '1. first', '2. second', '```', 'SELECT 1;', '```'].join('\n'),
    );
    expect(blocks).toEqual([
      { type: 'h', text: 'Joins' },
      { type: 'p', text: 'Intro line\nsecond line' },
      { type: 'ul', items: ['one', 'two'] },
      { type: 'ol', items: ['first', 'second'] },
      { type: 'code', text: 'SELECT 1;' },
    ]);
  });

  it('keeps html-looking text as inert strings', () => {
    const blocks = parseBlocks('<img src=x onerror=alert(1)> **ok**');
    expect(blocks).toEqual([{ type: 'p', text: '<img src=x onerror=alert(1)> **ok**' }]);
    expect(parseInline(blocks[0].text)[0]).toEqual({ type: 'text', value: '<img src=x onerror=alert(1)> ' });
  });

  it('handles an unterminated code fence without throwing', () => {
    expect(parseBlocks('```\nopen block')).toEqual([{ type: 'code', text: 'open block' }]);
  });
});

describe('image markers', () => {
  it('turns a line holding only [image:N] into an image block', () => {
    expect(parseBlocks('Look here:\n[image:2]\nDone')).toEqual([
      { type: 'p', text: 'Look here:' },
      { type: 'image', index: 2 },
      { type: 'p', text: 'Done' },
    ]);
  });

  it('leaves an inline [image:1] mention as ordinary text', () => {
    expect(parseBlocks('see [image:1] above')).toEqual([{ type: 'p', text: 'see [image:1] above' }]);
  });

  it('parses a markdown table into head and padded rows', () => {
    const blocks = parseBlocks(['Subjects:', '| Code | Name |', '| --- | --- |', '| ICT101 | Databases |', '| ICT102 |', '', 'After'].join('\n'));
    expect(blocks).toEqual([
      { type: 'p', text: 'Subjects:' },
      {
        type: 'table',
        head: ['Code', 'Name'],
        rows: [
          ['ICT101', 'Databases'],
          ['ICT102', ''],
        ],
      },
      { type: 'p', text: 'After' },
    ]);
  });

  it('does not mistake a line with a pipe for a table', () => {
    expect(parseBlocks('a | b')).toEqual([{ type: 'p', text: 'a | b' }]);
  });
});
