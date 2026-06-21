// Grammar-guided markdown generator for the fuzz suite (T28.3 / T28.5).
//
// Hand-rolled because no published JS/TS markdown-input generator exists; the
// closest prior art is lezer-markdown's random-change test (covers character
// edits, not construct generation) and cmark-gfm's `fuzzing_dictionary` (a
// token list, not a generator).
//
// Construct alphabet covers Plainmark's full surface minus mermaid fences
// (lazy bundle load is async — orthogonal to source-preservation tests).
// Tables are emitted because they are first-class to the source-preservation
// invariant; the carve-out in INV-SP-2 is the caller's concern.

import { mulberry32, pick, range, type Rng } from './rng.js';

const WORDS = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'foo',
  'bar',
  'baz',
  'qux',
  'alpha',
  'beta',
];
const LANGUAGES = ['', 'js', 'ts', 'py', 'rust', 'sh'];
const CALLOUT_KINDS = ['NOTE', 'TIP', 'WARNING', 'IMPORTANT', 'CAUTION'];
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const INLINE_FORMS = ['text', 'strong', 'em', 'strike', 'code', 'link', 'image', 'math'] as const;
const BLOCK_FORMS = [
  'paragraph',
  'heading',
  'fenced_code',
  'blockquote',
  'bullet_list',
  'ordered_list',
  'task_list',
  'table',
  'callout',
  'math_block',
  'hr',
  'footnote_def',
] as const;

function word(rng: Rng): string {
  return pick(rng, WORDS);
}

function inline(rng: Rng): string {
  const w = word(rng);
  switch (pick(rng, INLINE_FORMS)) {
    case 'text':
      return w;
    case 'strong':
      return `**${w}**`;
    case 'em':
      return `*${w}*`;
    case 'strike':
      return `~~${w}~~`;
    case 'code':
      return `\`${w}\``;
    case 'link':
      return `[${w}](https://example.test/${w})`;
    case 'image':
      return `![${w}](https://example.test/${w}.png)`;
    case 'math':
      return `$${w}$`;
  }
}

function paragraph(rng: Rng): string {
  const n = range(rng, 1, 4);
  const spans = [];
  for (let i = 0; i < n; i++) spans.push(inline(rng));
  return spans.join(' ');
}

function block(rng: Rng): string {
  switch (pick(rng, BLOCK_FORMS)) {
    case 'paragraph':
      return paragraph(rng);
    case 'heading':
      return '#'.repeat(pick(rng, HEADING_LEVELS)) + ' ' + paragraph(rng);
    case 'fenced_code':
      return '```' + pick(rng, LANGUAGES) + '\nconst x = ' + range(rng, 0, 99) + ';\n```';
    case 'blockquote':
      return '> ' + paragraph(rng);
    case 'bullet_list': {
      const n = range(rng, 1, 4);
      const out = [];
      for (let i = 0; i < n; i++) out.push('- ' + paragraph(rng));
      return out.join('\n');
    }
    case 'ordered_list': {
      const n = range(rng, 1, 4);
      const out = [];
      for (let i = 0; i < n; i++) out.push(`${i + 1}. ` + paragraph(rng));
      return out.join('\n');
    }
    case 'task_list': {
      const n = range(rng, 1, 4);
      const out = [];
      for (let i = 0; i < n; i++) out.push(`- [${rng() < 0.5 ? ' ' : 'x'}] ` + paragraph(rng));
      return out.join('\n');
    }
    case 'table':
      return [
        '| ' + word(rng) + ' | ' + word(rng) + ' |',
        '| --- | --- |',
        '| ' + word(rng) + ' | ' + word(rng) + ' |',
        '| ' + word(rng) + ' | ' + word(rng) + ' |',
      ].join('\n');
    case 'callout':
      return `> [!${pick(rng, CALLOUT_KINDS)}]\n> ` + paragraph(rng);
    case 'math_block':
      return '$$\n' + word(rng) + ' = ' + word(rng) + '\n$$';
    case 'hr':
      return '---';
    case 'footnote_def':
      return `[^${word(rng)}-${range(rng, 1, 99)}]: ` + paragraph(rng);
  }
}

export interface GenOptions {
  seed: number;
  min_blocks?: number;
  max_blocks?: number;
}

export function gen_markdown(opts: GenOptions): string {
  const rng = mulberry32(opts.seed);
  const n_blocks = range(rng, opts.min_blocks ?? 1, opts.max_blocks ?? 6);
  const blocks = [];
  for (let i = 0; i < n_blocks; i++) blocks.push(block(rng));
  return blocks.join('\n\n') + '\n';
}
