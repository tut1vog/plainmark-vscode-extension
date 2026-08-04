import { markdown } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { quote_prefixed_paste_text } from './paste_quote.js';

// `|` marks the caret in the fixture and is stripped before building the state.
function state_with_caret(doc_with_caret: string): EditorState {
  const caret = doc_with_caret.indexOf('|');
  const doc = doc_with_caret.slice(0, caret) + doc_with_caret.slice(caret + 1);
  return EditorState.create({
    doc,
    selection: { anchor: caret },
    extensions: [markdown({ extensions: [GFM] })],
  });
}

describe('BQ-I-13 quote_prefixed_paste_text re-prefixes multi-line pastes', () => {
  it('prefixes each line after the first with the caret line marker run', () => {
    const state = state_with_caret('> alpha|\n> beta');
    expect(quote_prefixed_paste_text(state, 'one\ntwo')).toBe('one\n> two');
  });

  it('preserves nesting depth', () => {
    const state = state_with_caret('> > deep|');
    expect(quote_prefixed_paste_text(state, 'a\nb')).toBe('a\n> > b');
  });

  it('keeps a tight marker tight', () => {
    const state = state_with_caret('>tight|');
    expect(quote_prefixed_paste_text(state, 'a\nb')).toBe('a\n>b');
  });

  it('uses only the markers before a caret between nested markers', () => {
    const state = state_with_caret('> |> nested');
    expect(quote_prefixed_paste_text(state, 'a\nb')).toBe('a\n> b');
  });

  it('applies on callout header and body lines (Blockquote nodes)', () => {
    const header = state_with_caret('> [!NOTE] title|\n> body');
    expect(quote_prefixed_paste_text(header, 'a\nb')).toBe('a\n> b');
    const body = state_with_caret('> [!NOTE] title\n> body|');
    expect(quote_prefixed_paste_text(body, 'a\nb')).toBe('a\n> b');
  });

  it('turns blank pasted lines into marker-only lines', () => {
    const state = state_with_caret('> alpha|');
    expect(quote_prefixed_paste_text(state, 'a\n\nb')).toBe('a\n> \n> b');
  });

  it('keeps the post-caret remainder quoted on a trailing-newline paste', () => {
    const state = state_with_caret('> al|pha');
    expect(quote_prefixed_paste_text(state, 'one\n')).toBe('one\n> ');
  });

  it('takes the prefix from the selection-start line of a multi-line selection', () => {
    const state = EditorState.create({
      doc: '> > alpha\n> beta',
      selection: { anchor: 7, head: 12 },
      extensions: [markdown({ extensions: [GFM] })],
    });
    expect(quote_prefixed_paste_text(state, 'a\nb')).toBe('a\n> > b');
  });
});

describe('BQ-I-13 quote_prefixed_paste_text yields to the default paste', () => {
  it('on single-line text', () => {
    const state = state_with_caret('> alpha|');
    expect(quote_prefixed_paste_text(state, 'one')).toBeNull();
  });

  it('with the caret at or before the first marker', () => {
    expect(quote_prefixed_paste_text(state_with_caret('|> alpha'), 'a\nb')).toBeNull();
  });

  it('outside a blockquote', () => {
    expect(quote_prefixed_paste_text(state_with_caret('plain|'), 'a\nb')).toBeNull();
  });

  it('on a quote-looking line inside a code fence', () => {
    const state = state_with_caret('```\n> not a quote|\n```');
    expect(quote_prefixed_paste_text(state, 'a\nb')).toBeNull();
  });

  it('on a multi-range selection', () => {
    const state = EditorState.create({
      doc: '> alpha\n> beta',
      selection: EditorSelection.create([
        EditorSelection.cursor(7),
        EditorSelection.cursor(14),
      ]),
      extensions: [
        markdown({ extensions: [GFM] }),
        EditorState.allowMultipleSelections.of(true),
      ],
    });
    expect(quote_prefixed_paste_text(state, 'a\nb')).toBeNull();
  });
});
