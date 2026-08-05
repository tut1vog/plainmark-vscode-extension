import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import {
  resolve_prettify_seams,
  SEAM_KINDS,
  type SeamKind,
} from '../common/prettify_seams_config.js';
import { Footnote } from './decorations/footnote_parser.js';
import { frontmatter_extension } from './grammar/frontmatter.js';
import { math_extension } from './grammar/math.js';
import { quote_exit_extension } from './grammar/quote_exit.js';
import { prettify_seams_spec } from './prettify_seams.js';

function make_state(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      markdown({
        extensions: [GFM, math_extension, Footnote, frontmatter_extension, quote_exit_extension],
      }),
    ],
  });
}

function prettify(doc: string, seams: Record<string, unknown> = {}): string | null {
  const state = make_state(doc);
  const spec = prettify_seams_spec(state, resolve_prettify_seams(seams).resolved);
  if (!spec) return null;
  return state.update(spec).state.doc.toString();
}

describe('PARA-I-7 prettify_seams_spec', () => {
  describe('heading rhythm', () => {
    it('opens a blank above a heading and closes the one below it', () => {
      expect(prettify('para\n## h\nbody\n')).toBe('para\n\n## h\nbody\n');
      expect(prettify('para\n\n## h\n\nbody\n')).toBe('para\n\n## h\nbody\n');
    });

    it('stacks adjacent headings tight', () => {
      expect(prettify('# a\n\n## b\n')).toBe('# a\n## b\n');
      expect(prettify('# a\n## b\n')).toBeNull();
    });

    it('takes no blank above a heading that opens the document body', () => {
      expect(prettify('---\ntitle: x\n---\n\n# h\n')).toBe('---\ntitle: x\n---\n# h\n');
      expect(prettify('***\n\n# h\n')).toBe('***\n# h\n');
    });

    it('opens a blank above a heading behind any other block', () => {
      expect(prettify('```\nx\n```\n# h\n')).toBe('```\nx\n```\n\n# h\n');
      expect(prettify('$$\nx\n$$\n# h\n')).toBe('$$\nx\n$$\n\n# h\n');
    });
  });

  describe('paragraphs', () => {
    it('closes the seam between two paragraphs without joining their lines', () => {
      expect(prettify('a\n\nb\n')).toBe('a\nb\n');
      expect(prettify('a\nb\n')).toBeNull();
    });

    it('never touches a seam interior to one paragraph', () => {
      expect(prettify('a  \nb\n')).toBeNull();
      expect(prettify('第一段\n第二段\n')).toBeNull();
    });
  });

  describe('blocks closed by a blank line', () => {
    it('keeps the blank below a list, quote, table, or definition', () => {
      expect(prettify('- a\n- b\n\npara\n')).toBeNull();
      expect(prettify('> q\n\npara\n')).toBeNull();
      expect(prettify('| a |\n| - |\n\npara\n')).toBeNull();
      expect(prettify('- a\n- b\n\n## h\n')).toBeNull();
    });

    it('collapses a multi-blank run below one to a single blank', () => {
      expect(prettify('- a\n\n\n\npara\n')).toBe('- a\n\npara\n');
      expect(prettify('> q\n\n\npara\n')).toBe('> q\n\npara\n');
    });

    it('stacks definitions tight', () => {
      expect(prettify('[^1]: a\n\n[^2]: b\n')).toBe('[^1]: a\n[^2]: b\n');
    });
  });

  describe('can-interrupt-a-paragraph guards', () => {
    it('keeps the blank above a block that would fold into the paragraph', () => {
      expect(prettify('para\n\n    code\n')).toBeNull();
      expect(prettify('para\n\n2. item\n')).toBeNull();
      expect(prettify('para\n\n| a |\n| - |\n')).toBeNull();
      expect(prettify('para\n\n<div>x</div>\n')).toBeNull();
      expect(prettify('para\n\n[^1]: n\n')).toBeNull();
    });

    it('keeps the blank above a setext-underline lookalike', () => {
      expect(prettify('para\n\n---\n')).toBeNull();
      expect(prettify('para\n\n===\n')).toBeNull();
      expect(prettify('para\n\n***\n')).toBe('para\n***\n');
    });

    it('closes the seam above a block that interrupts cleanly', () => {
      expect(prettify('para\n\n- item\n')).toBe('para\n- item\n');
      expect(prettify('para\n\n1. item\n')).toBe('para\n1. item\n');
      expect(prettify('para\n\n> q\n')).toBe('para\n> q\n');
      expect(prettify('para\n\n```js\nx\n```\n')).toBe('para\n```js\nx\n```\n');
      expect(prettify('para\n\n$$\nx\n$$\n')).toBe('para\n$$\nx\n$$\n');
    });
  });

  describe('blocks with an explicit closer', () => {
    it('closes the seam below a fence or math block', () => {
      expect(prettify('```\nx\n```\n\npara\n')).toBe('```\nx\n```\npara\n');
      expect(prettify('$$\nx\n$$\n\npara\n')).toBe('$$\nx\n$$\npara\n');
    });
  });

  describe('untouched', () => {
    it('leaves setext headings on either side of a seam', () => {
      expect(prettify('setext\n===\n\npara\n')).toBeNull();
      expect(prettify('para\n\nsetext\n===\n')).toBeNull();
    });

    it('leaves container interiors and doc-edge blank runs', () => {
      expect(prettify('- a\n\n- b\n')).toBeNull();
      expect(prettify('> a\n>\n> b\n')).toBeNull();
      expect(prettify('\n\npara\n')).toBeNull();
      expect(prettify('para\n\n\n')).toBeNull();
    });

    it('leaves a line a neighbouring block has already absorbed', () => {
      expect(prettify('- a\nlazy continuation\n')).toBeNull();
      expect(prettify('<div>x</div>\nswallowed\n')).toBeNull();
    });

    it('dispatches nothing when every seam already conforms', () => {
      expect(prettify('# h\nbody\n\n## s\nmore\n')).toBeNull();
    });
  });

  describe('configured overrides (PARA-I-8)', () => {
    it('pins a single ordered pair', () => {
      expect(prettify('| a |\n| - |\n\n## h\n', { 'table>heading': 0 })).toBe(
        '| a |\n| - |\n## h\n',
      );
      expect(prettify('# h\nbody\n', { 'heading>paragraph': 1 })).toBe('# h\n\nbody\n');
    });

    it('applies a wildcard to every seam on that side', () => {
      expect(prettify('# h\nbody\n\n## s\nmore\n', { 'heading>*': 1 })).toBe(
        '# h\n\nbody\n\n## s\n\nmore\n',
      );
    });

    it('lets a pinned pair beat a wildcard', () => {
      expect(prettify('# h\nbody\n\n## s\nmore\n', { 'heading>*': 1, 'heading>heading': 0 })).toBe(
        '# h\n\nbody\n\n## s\n\nmore\n',
      );
    });

    it('opens more than one blank line when asked', () => {
      expect(prettify('para\n\n## h\n', { 'paragraph>heading': 2 })).toBe('para\n\n\n## h\n');
      expect(prettify('para\n\n\n\n## h\n', { 'paragraph>heading': 2 })).toBe('para\n\n\n## h\n');
    });

    it('clamps a pin that would break the parse', () => {
      expect(prettify('- a\n\npara\n', { 'list>paragraph': 0 })).toBeNull();
      expect(prettify('> q\n\npara\n', { '*>*': 0 })).toBeNull();
      expect(prettify('<div>x</div>\n\npara\n', { 'html>paragraph': 0 })).toBeNull();
      expect(prettify('para\n\n| a |\n| - |\n', { 'paragraph>table': 0 })).toBeNull();
      // A GFM table body runs on over the line below it, so this pair is locked
      // at one blank however it is pinned.
      expect(prettify('| a |\n| - |\n\npara\n', { 'table>paragraph': 0 })).toBeNull();
    });

    it('ignores a malformed pin and keeps the shipped default', () => {
      expect(prettify('para\n## h\n', { 'widget>heading': 0 })).toBe('para\n\n## h\n');
    });
  });

  // Every pair pinned to zero must still parse into the same two blocks: the
  // floor, not the default, is what protects the document.
  describe('parse-safety floor holds for every ordered pair', () => {
    const SNIPPET: Record<SeamKind, string> = {
      frontmatter: '---\ntitle: x\n---',
      heading: '## Heading',
      paragraph: 'Paragraph text.',
      list: '- item one\n- item two',
      quote: '> quoted line',
      code: '```js\ncode();\n```',
      indentedCode: '    code();',
      table: '| a | b |\n| - | - |\n| 1 | 2 |',
      math: '$$\nx^2\n$$',
      rule: '***',
      html: '<div>html</div>',
      definition: '[^1]: note body',
    };
    // No two-top-level-block form exists: a 4-space-indented block below a list
    // is that list's own continuation, and two same-shaped blocks around a blank
    // are one block with the blank inside it.
    const UNREPRESENTABLE = new Set([
      'list>indentedCode',
      'list>list',
      'indentedCode>indentedCode',
    ]);
    // The one seam whose whole purpose is to merge: PARA-E-5's house model shows
    // the single-newline break that CommonMark folds away.
    const MERGES_BY_DESIGN = new Set(['paragraph>paragraph']);

    function kinds_of(doc: string): string[] {
      const state = make_state(doc);
      const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
      const names: string[] = [];
      for (let n = tree.topNode.firstChild; n; n = n.nextSibling) names.push(n.name);
      return names;
    }

    for (const above of SEAM_KINDS) {
      for (const below of SEAM_KINDS) {
        const pair = `${above}>${below}`;
        if (below === 'frontmatter') continue;
        if (UNREPRESENTABLE.has(pair)) continue;
        it(`${above} → ${below}`, () => {
          const doc = `${SNIPPET[above]}\n\n${SNIPPET[below]}\n`;
          const before = kinds_of(doc);
          expect(before).toHaveLength(2);
          const after = prettify(doc, { '*>*': 0 }) ?? doc;
          if (MERGES_BY_DESIGN.has(pair)) {
            expect(kinds_of(after)).toEqual(['Paragraph']);
            return;
          }
          expect(kinds_of(after)).toEqual(before);
        });
      }
    }
  });

  it('normalizes a whole document in one pass', () => {
    const before = [
      '# title',
      '',
      'intro one',
      'intro two',
      '',
      '',
      '## section',
      '',
      '- a',
      '- b',
      'trailing prose',
      '',
      '```js',
      'x',
      '```',
      '',
      '## next',
      '',
      'end',
      '',
    ].join('\n');
    const after = [
      '# title',
      'intro one',
      'intro two',
      '',
      '## section',
      '- a',
      '- b',
      'trailing prose',
      '',
      '```js',
      'x',
      '```',
      '',
      '## next',
      'end',
      '',
    ].join('\n');
    expect(prettify(before)).toBe(after);
  });
});
