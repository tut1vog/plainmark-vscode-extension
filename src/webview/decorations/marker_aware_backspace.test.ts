import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import {
  lazy_continuation_backspace,
  marker_aware_backspace,
} from './marker_aware_backspace.js';

interface FakeView {
  view: EditorView;
  applied: TransactionSpec[];
  doc: () => string;
  head: () => number;
}

function make_view(initial_doc: string, anchor: number): FakeView {
  let state = EditorState.create({
    doc: initial_doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor },
  });
  const applied: TransactionSpec[] = [];
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      applied.push(spec);
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  return {
    view,
    applied,
    doc: () => state.doc.toString(),
    head: () => state.selection.main.head,
  };
}

describe('marker_aware_backspace MRS-B-1 MRS-B-2 MRS-B-3 MRS-B-4 MRS-B-5 MRS-B-6 MRS-B-7 MRS-B-8', () => {
  describe('FIRES — content after marker with extra whitespace', () => {
    it('list item `-  hello` at col 2 → restores `- hello`', () => {
      const { view, applied, doc, head } = make_view('-  hello', 2);
      expect(marker_aware_backspace(view)).toBe(true);
      expect(applied).toHaveLength(1);
      expect(doc()).toBe('- hello');
      expect(head()).toBe(1);
    });

    it('ordered list `1.  hello` at col 3 → restores `1. hello`', () => {
      const { view, doc, head } = make_view('1.  hello', 3);
      expect(marker_aware_backspace(view)).toBe(true);
      expect(doc()).toBe('1. hello');
      expect(head()).toBe(2);
    });
  });

  describe('YIELDS — blockquote contexts (DEF-10: consumed upstream by blockquote_plain_backspace)', () => {
    it('blockquote `>  hello` at col 2 returns false', () => {
      const { view, applied } = make_view('>  hello', 2);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });

    it('callout `>  [!CAUTION]` at col 2 returns false', () => {
      const { view, applied } = make_view('>  [!CAUTION]', 2);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });

    it('nested blockquote `> >  hello` at col 4 returns false', () => {
      const { view, applied } = make_view('> >  hello', 4);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });
  });

  describe('YIELDS — empty marker line (preserves lang-markdown affordance)', () => {
    it('empty blockquote `> ` at col 2 returns false', () => {
      const { view, applied } = make_view('> ', 2);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });

    it('empty list item `- ` at col 2 returns false', () => {
      const { view, applied } = make_view('- ', 2);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });

    it('blockquote with marker space only `>   ` at col 2 returns false', () => {
      const { view, applied } = make_view('>   ', 2);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });
  });

  describe('YIELDS — canonical marker (single space, content follows)', () => {
    it('canonical `> hello` at col 2 returns false (lang-markdown demote affordance retained)', () => {
      const { view, applied } = make_view('> hello', 2);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });

    it('canonical `- hello` at col 2 returns false', () => {
      const { view, applied } = make_view('- hello', 2);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });
  });

  describe('YIELDS — caret not at marker_end', () => {
    it('blockquote `>  hello` at col 1 returns false', () => {
      const { view, applied } = make_view('>  hello', 1);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });

    it('blockquote `>  hello` at col 3 returns false', () => {
      const { view, applied } = make_view('>  hello', 3);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });

    it('blockquote `>  hello` at col 0 returns false (head === 0 guard)', () => {
      const { view, applied } = make_view('>  hello', 0);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });
  });

  describe('YIELDS — non-empty selection', () => {
    it('range selection across the marker boundary returns false', () => {
      const state = EditorState.create({
        doc: '>  hello',
        extensions: [markdown({ extensions: [GFM] })],
        selection: { anchor: 0, head: 2 },
      });
      const applied: TransactionSpec[] = [];
      const view = {
        get state() {
          return state;
        },
        dispatch(spec: TransactionSpec) {
          applied.push(spec);
        },
      } as unknown as EditorView;
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });
  });

  describe('YIELDS — non-markdown contexts (false-positive guard)', () => {
    it('matched pattern inside a fenced code block returns false', () => {
      // The `>  hello` line lives inside ```\n...\n```, so the syntax tree
      // resolves to CodeBlock / FencedCode — no Blockquote/ListItem ancestor.
      const doc = '```\n>  hello\n```';
      // Position the caret at col 2 of the `>  hello` line. The line starts
      // at offset 4 (after "```\n"), so col 2 is offset 6.
      const { view, applied } = make_view(doc, 6);
      expect(marker_aware_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });
  });

  describe('FIRES — second-keystroke chain reduces extra whitespace one at a time', () => {
    it('`-   hello` (triple space) at col 2 → `-  hello`, caret 1; chains to canonical', () => {
      const { view, doc, head } = make_view('-   hello', 2);
      expect(marker_aware_backspace(view)).toBe(true);
      expect(doc()).toBe('-  hello');
      expect(head()).toBe(1);
    });
  });
});

describe('lazy_continuation_backspace MRS-B-10', () => {
  describe('FIRES — lazy-continuation line with no literal marker', () => {
    it('list lazy line `- q\\n`#x` → deletes one char, keeps the backtick', () => {
      // line 2 `` `#x `` lazily continues the list item; caret after `#` (offset 6).
      const { view, doc, head } = make_view('- q\n`#x', 6);
      expect(lazy_continuation_backspace(view)).toBe(true);
      expect(doc()).toBe('- q\n`x');
      expect(head()).toBe(5);
    });

    it('ordered-list lazy line `1. q\\n`#x` → deletes only the `#`', () => {
      const { view, doc } = make_view('1. q\n`#x', 7);
      expect(lazy_continuation_backspace(view)).toBe(true);
      expect(doc()).toBe('1. q\n`x');
    });
  });

  describe('YIELDS', () => {
    it('blockquote lazy line `> q\\n`#x` yields (DEF-10: consumed upstream by blockquote_plain_backspace)', () => {
      const { view, applied } = make_view('> q\n`#x', 6);
      expect(lazy_continuation_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });

    it('a line that physically starts with a marker (`> x`) yields to the marker path', () => {
      const { view, applied } = make_view('> x', 3);
      expect(lazy_continuation_backspace(view)).toBe(false);
      expect(applied).toHaveLength(0);
    });

    it('caret at line start yields', () => {
      const { view } = make_view('> q\nabc', 4);
      expect(lazy_continuation_backspace(view)).toBe(false);
    });

    it('indentation-only before the caret yields (lang-markdown dedent affordance)', () => {
      const { view } = make_view('> q\n  abc', 6); // caret amid leading spaces
      expect(lazy_continuation_backspace(view)).toBe(false);
    });

    it('a plain paragraph not inside a blockquote/list yields', () => {
      const { view } = make_view('`#x', 2);
      expect(lazy_continuation_backspace(view)).toBe(false);
    });

    it('a non-empty selection yields', () => {
      const { view } = make_view('> q\n`#x', 4);
      // widen to a range
      const state = view.state.update({ selection: { anchor: 4, head: 6 } }).state;
      const v = {
        get state() {
          return state;
        },
        dispatch() {},
      } as unknown as EditorView;
      expect(lazy_continuation_backspace(v)).toBe(false);
    });
  });
});
