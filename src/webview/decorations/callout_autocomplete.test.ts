import { CompletionContext } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { callout_completions } from './callout_autocomplete.js';
import { KNOWN_TYPES } from './callout_detect.js';

function state_with(doc: string, anchor: number = doc.length): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ extensions: [GFM] })],
  });
}

function context_at(doc: string, pos: number): CompletionContext {
  const state = state_with(doc, pos);
  return new CompletionContext(state, pos, true);
}

describe('callout_completions — gating CALL-I-2', () => {
  it('returns null on an empty line', () => {
    expect(callout_completions(context_at('', 0))).toBeNull();
  });

  it('returns null on a `> ` line with no `[`', () => {
    const doc = '> ';
    expect(callout_completions(context_at(doc, doc.length))).toBeNull();
  });

  it('returns null when there is content after the `[` (e.g. `> [foo`)', () => {
    const doc = '> [foo';
    expect(callout_completions(context_at(doc, doc.length))).toBeNull();
  });

  it('returns null on a bare `[` with no `>` prefix', () => {
    const doc = '[';
    expect(callout_completions(context_at(doc, doc.length))).toBeNull();
  });

  it('returns null on ` [` (leading space, no `>` prefix)', () => {
    const doc = ' [';
    expect(callout_completions(context_at(doc, doc.length))).toBeNull();
  });

  it('returns null when caret is BEFORE the `[`', () => {
    const doc = '> [';
    expect(callout_completions(context_at(doc, 2))).toBeNull();
  });

  it('returns a result when caret is mid-line right after `[` even with trailing bytes — regex tests text-before-caret only', () => {
    const doc = '> [xyz';
    // Caret right after `[`; text-before-caret is `> [`, which matches the trigger.
    const result = callout_completions(context_at(doc, 3));
    expect(result).not.toBeNull();
    expect(result!.options).toHaveLength(KNOWN_TYPES.length);
  });
});

describe('callout_completions — triggers CALL-I-2 CALL-I-5', () => {
  it('fires on `> [` with caret at end', () => {
    const doc = '> [';
    const result = callout_completions(context_at(doc, doc.length));
    expect(result).not.toBeNull();
    expect(result!.options).toHaveLength(5);
  });

  it('fires on `>[` (no space) with caret at end', () => {
    const doc = '>[';
    const result = callout_completions(context_at(doc, doc.length));
    expect(result).not.toBeNull();
    expect(result!.options).toHaveLength(5);
  });

  it('fires on `> > [` (nested depth 2)', () => {
    const doc = '> > [';
    const result = callout_completions(context_at(doc, doc.length));
    expect(result).not.toBeNull();
    expect(result!.options).toHaveLength(5);
  });

  it('fires on `> > > [` (nested depth 3)', () => {
    const doc = '> > > [';
    const result = callout_completions(context_at(doc, doc.length));
    expect(result).not.toBeNull();
    expect(result!.options).toHaveLength(5);
  });

  it('fires on a `> [` line in the middle of a document', () => {
    const doc = 'paragraph one\n\nparagraph two\n\n> [';
    const result = callout_completions(context_at(doc, doc.length));
    expect(result).not.toBeNull();
    expect(result!.options).toHaveLength(5);
  });
});

describe('callout_completions — option shape CALL-I-3 CALL-I-4', () => {
  it('emits exactly 5 options (matches KNOWN_TYPES length)', () => {
    const doc = '> [';
    const result = callout_completions(context_at(doc, doc.length))!;
    expect(result.options).toHaveLength(KNOWN_TYPES.length);
  });

  it('labels are `!NOTE]`, `!TIP]`, `!IMPORTANT]`, `!WARNING]`, `!CAUTION]` in KNOWN_TYPES order', () => {
    const doc = '> [';
    const result = callout_completions(context_at(doc, doc.length))!;
    expect(result.options.map((o) => o.label)).toEqual([
      '!NOTE]',
      '!TIP]',
      '!IMPORTANT]',
      '!WARNING]',
      '!CAUTION]',
    ]);
  });

  it('details are the canonical titles in KNOWN_TYPES order', () => {
    const doc = '> [';
    const result = callout_completions(context_at(doc, doc.length))!;
    expect(result.options.map((o) => o.detail)).toEqual([
      'Note',
      'Tip',
      'Important',
      'Warning',
      'Caution',
    ]);
  });

  it('each `apply` string ends with a trailing space (caret-ready for custom title)', () => {
    const doc = '> [';
    const result = callout_completions(context_at(doc, doc.length))!;
    for (const opt of result.options) {
      expect(typeof opt.apply).toBe('string');
      expect((opt.apply as string).endsWith('] ')).toBe(true);
    }
  });

  it('each `apply` matches its label plus a trailing space', () => {
    const doc = '> [';
    const result = callout_completions(context_at(doc, doc.length))!;
    for (const opt of result.options) {
      expect(opt.apply).toBe(`${opt.label} `);
    }
  });

  it('`from` equals ctx.pos (insert after the existing `[`, do not replace)', () => {
    const doc = '> [';
    const pos = doc.length;
    const result = callout_completions(context_at(doc, pos))!;
    expect(result.from).toBe(pos);
  });

  it('does not set filter:false (fuzzy filtering on type name is desired)', () => {
    const doc = '> [';
    const result = callout_completions(context_at(doc, doc.length))!;
    expect(result.filter).not.toBe(false);
  });
});
