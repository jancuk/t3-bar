import { describe, expect, it } from 'vitest';
import { parseInlines, parseMarkdown } from '../src/shared/markdown';

describe('parseInlines', () => {
  it('parses bold, italic, strike, and inline code', () => {
    expect(parseInlines('**Semar** is *fast* with `go test` and ~~old~~')).toEqual([
      { type: 'bold', children: [{ type: 'text', text: 'Semar' }] },
      { type: 'text', text: ' is ' },
      { type: 'italic', children: [{ type: 'text', text: 'fast' }] },
      { type: 'text', text: ' with ' },
      { type: 'code', text: 'go test' },
      { type: 'text', text: ' and ' },
      { type: 'strike', children: [{ type: 'text', text: 'old' }] },
    ]);
  });

  it('keeps markdown syntax literal inside inline code', () => {
    expect(parseInlines('Run `**not bold**` now')).toEqual([
      { type: 'text', text: 'Run ' },
      { type: 'code', text: '**not bold**' },
      { type: 'text', text: ' now' },
    ]);
  });

  it('does not italicize snake_case identifiers', () => {
    expect(parseInlines('app sinau_mobile_v2 works')).toEqual([
      { type: 'text', text: 'app sinau_mobile_v2 works' },
    ]);
  });

  it('parses http/https links and ignores unsafe schemes', () => {
    expect(parseInlines('[docs](https://example.com/a) and [bad](javascript:alert(1))')).toEqual([
      { type: 'link', label: 'docs', href: 'https://example.com/a' },
      { type: 'text', text: ' and [bad](javascript:alert(1))' },
    ]);
  });
});

describe('parseMarkdown', () => {
  it('parses headings, paragraphs, bullet lists, and bold inside list items', () => {
    const md = [
      '## Overview',
      '',
      '**Semar** is a Go CLI.',
      '',
      '- **Drafting:** A model drafts tests.',
      '- **Running:** Executes steps.',
    ].join('\n');

    expect(parseMarkdown(md)).toEqual([
      { type: 'heading', level: 2, children: [{ type: 'text', text: 'Overview' }] },
      {
        type: 'paragraph',
        children: [
          { type: 'bold', children: [{ type: 'text', text: 'Semar' }] },
          { type: 'text', text: ' is a Go CLI.' },
        ],
      },
      {
        type: 'list',
        ordered: false,
        items: [
          [
            { type: 'bold', children: [{ type: 'text', text: 'Drafting:' }] },
            { type: 'text', text: ' A model drafts tests.' },
          ],
          [
            { type: 'bold', children: [{ type: 'text', text: 'Running:' }] },
            { type: 'text', text: ' Executes steps.' },
          ],
        ],
      },
    ]);
  });

  it('parses fenced code blocks, ordered lists, blockquotes, and hr', () => {
    const md = [
      '1. First',
      '2. Second',
      '',
      '> Quoted note',
      '',
      '```ts',
      'const x = "**literal**";',
      '```',
      '',
      '---',
    ].join('\n');

    expect(parseMarkdown(md)).toEqual([
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', text: 'First' }], [{ type: 'text', text: 'Second' }]],
      },
      { type: 'quote', children: [{ type: 'text', text: 'Quoted note' }] },
      { type: 'code', lang: 'ts', text: 'const x = "**literal**";' },
      { type: 'hr' },
    ]);
  });

  it('handles unclosed code fences safely', () => {
    expect(parseMarkdown('```sh\necho hi')).toEqual([
      { type: 'code', lang: 'sh', text: 'echo hi' },
    ]);
  });
});
