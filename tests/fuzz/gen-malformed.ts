// Malformed-markdown corpus + mutator for the fuzz suite.
//
// Complements `gen-markdown.ts`, which emits only well-formed constructs:
// `CURATED` is a hand-written adversarial corpus targeting Plainmark's full
// dialect (unterminated fences/math, broken tables, malformed callouts and
// frontmatter, nesting bombs, delimiter runs, control characters);
// `mutate_markdown` derives malformed variants from well-formed generator
// output by truncating, deleting/duplicating/swapping lines, and splicing
// hazard tokens at random offsets.
//
// Everything here is LF-only: the webview doc is LF-normalized by contract
// (SYNC-H-3 / SYNC-P-6), and CR-flavor inputs are owned by the metamorphic
// suite's host-boundary normalization properties.

import { pick, range, type Rng } from './rng.js';

export interface MalformedCase {
  name: string;
  text: string;
}

export const CURATED: readonly MalformedCase[] = [
  { name: 'empty-doc', text: '' },
  { name: 'whitespace-only', text: ' \n  \n\t\n' },
  { name: 'unterminated-fence-eof', text: '```js\nconst x = 1;\n' },
  { name: 'fence-closer-too-short', text: '````\ncode\n```\n' },
  { name: 'fence-closer-wrong-char', text: '```\ncode\n~~~\n' },
  { name: 'mermaid-fence-garbage', text: '```mermaid\ngraph TD\nA-->\n' },
  { name: 'unterminated-math-block', text: '$$\n\\frac{1}{2}\n' },
  { name: 'unclosed-inline-math', text: 'a $\\alpha b\n' },
  { name: 'unclosed-inline-code', text: 'a `code b\n' },
  { name: 'unbalanced-emphasis', text: '**bold *and* tail\n' },
  { name: 'emphasis-soup', text: 'a *** b ** c * d __ e _ f\n' },
  { name: 'unclosed-strikethrough', text: '~~gone\n' },
  { name: 'emphasis-run-500', text: '*'.repeat(500) + '\n' },
  { name: 'bracket-nest-400', text: '['.repeat(400) + 'x' + ']'.repeat(200) + '\n' },
  { name: 'table-delimiter-missing-cell', text: '| a | b |\n| --- |\n| c | d |\n' },
  { name: 'table-delimiter-junk', text: '| a | b |\n| -x- | :--; |\n| c | d |\n' },
  { name: 'table-ragged-rows', text: '| a | b |\n| --- | --- |\n| c |\n| d | e | f | g |\n' },
  { name: 'table-truncated-mid-row', text: '| a | b |\n| --- | --- |\n| c | ' },
  { name: 'callout-unknown-kind', text: '> [!BOGUS]\n> body\n' },
  { name: 'callout-unclosed-bracket', text: '> [!NOTE\n> body\n' },
  { name: 'blockquote-depth-300', text: '>'.repeat(300) + ' deep\n' },
  {
    name: 'list-depth-100',
    text: Array.from({ length: 100 }, (_, i) => '  '.repeat(i) + '- d' + i).join('\n') + '\n',
  },
  { name: 'list-marker-at-eof', text: '-' },
  { name: 'task-list-malformed-states', text: '- [z] bad\n- [] empty\n- [x]tight\n' },
  { name: 'undefined-reference-link', text: '[x][nope]\n' },
  { name: 'link-dest-newline', text: '[a](https://example.test/a\nb)\n' },
  { name: 'unclosed-image', text: '![alt](https://example.test/a\n' },
  { name: 'footnote-ref-no-def', text: 'body[^ghost]\n' },
  { name: 'footnote-def-no-ref', text: '[^orphan]: definition\n' },
  { name: 'frontmatter-unclosed', text: '---\ntitle: x\nbroken: [\n' },
  { name: 'frontmatter-bad-yaml', text: '---\n: : :\n\t- {a\n---\nbody\n' },
  { name: 'setext-double-underline', text: 'text\n===\n===\n' },
  { name: 'heading-overflow', text: '########## not a heading\n' },
  { name: 'hr-soup', text: '***\n****\n* * * *\n-  -  -\n' },
  { name: 'html-unclosed', text: '<div><span class="x\n<table><tr>\n' },
  { name: 'control-chars', text: 'a\u0000b\u0001c\u007fd\n' },
  { name: 'zero-width-and-bidi', text: '-\u200b item\n\u202ereversed\u202c text\n' },
  { name: 'lone-surrogate', text: 'pre \ud800 post\n' },
  { name: 'bom-mid-doc', text: 'a\n\ufeffb\n' },
  { name: 'long-line-20k', text: 'x'.repeat(20000) + '\n' },
];

const HAZARD_TOKENS = [
  '```',
  '~~~',
  '$$',
  '$',
  '**',
  '*',
  '__',
  '~~',
  '`',
  '|',
  '[',
  ']',
  '](',
  '![',
  '> ',
  '- ',
  '- [ ] ',
  '#',
  '---',
  '[^',
  ']:',
  '<div',
  '</span>',
  '\\',
  '\u0000',
  '\u200b',
  '\ufeff',
  '\ud800',
] as const;

const MUTATION_KINDS = [
  'truncate',
  'delete_line',
  'duplicate_line',
  'swap_lines',
  'splice_token',
] as const;

export function mutate_markdown(rng: Rng, src: string): string {
  let out = src;
  const n = range(rng, 1, 3);
  for (let i = 0; i < n; i++) {
    switch (pick(rng, MUTATION_KINDS)) {
      case 'truncate':
        out = out.slice(0, Math.floor(rng() * out.length));
        break;
      case 'delete_line': {
        const lines = out.split('\n');
        lines.splice(Math.floor(rng() * lines.length), 1);
        out = lines.join('\n');
        break;
      }
      case 'duplicate_line': {
        const lines = out.split('\n');
        const at = Math.floor(rng() * lines.length);
        lines.splice(at, 0, lines[at]);
        out = lines.join('\n');
        break;
      }
      case 'swap_lines': {
        const lines = out.split('\n');
        if (lines.length < 2) break;
        const a = Math.floor(rng() * lines.length);
        const b = Math.floor(rng() * lines.length);
        [lines[a], lines[b]] = [lines[b], lines[a]];
        out = lines.join('\n');
        break;
      }
      case 'splice_token': {
        const at = Math.floor(rng() * (out.length + 1));
        out = out.slice(0, at) + pick(rng, HAZARD_TOKENS) + out.slice(at);
        break;
      }
    }
  }
  return out;
}
