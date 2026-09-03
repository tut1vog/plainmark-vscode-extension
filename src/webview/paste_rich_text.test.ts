import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { pasted_markdown_transaction } from './paste_rich_text.js';

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

function apply(state: EditorState, md: string): { text: string; head: number } {
  const tr = state.update(pasted_markdown_transaction(state, md));
  expect(tr.isUserEvent('input.paste')).toBe(true);
  return { text: tr.state.doc.toString(), head: tr.state.selection.main.head };
}

describe('PASTE-H-5 pasted_markdown_transaction placement and caret', () => {
  it('a lone paragraph inserts inline at the caret', () => {
    const result = apply(state_with_caret('keep |keep'), 'Use **pnpm** here.');
    expect(result.text).toBe('keep Use **pnpm** here.keep');
    expect(result.head).toBe('keep Use **pnpm** here.'.length);
  });

  it('a one-line block construct still takes its own line', () => {
    const result = apply(state_with_caret('keep |keep'), '## Title');
    expect(result.text).toBe('keep \n## Title\n\nkeep');
    expect(result.head).toBe('keep \n## Title\n'.length);
  });

  it('a multi-block result mid-line splits the line and separates the remainder with a blank', () => {
    const result = apply(state_with_caret('alpha|beta'), '## H\n\ntext');
    expect(result.text).toBe('alpha\n## H\n\ntext\n\nbeta');
    expect(result.head).toBe('alpha\n## H\n\ntext\n'.length);
  });

  it('at a line start no leading newline is added', () => {
    const result = apply(state_with_caret('alpha\n|beta'), '- a\n- b');
    expect(result.text).toBe('alpha\n- a\n- b\n\nbeta');
    expect(result.head).toBe('alpha\n- a\n- b\n'.length);
  });

  it('before an existing blank line no extra separation is added', () => {
    const result = apply(state_with_caret('alpha|\n\nbeta'), '- a\n- b');
    expect(result.text).toBe('alpha\n- a\n- b\n\nbeta');
    expect(result.head).toBe('alpha\n- a\n- b\n'.length);
  });

  it('at the end of the document a trailing newline is appended', () => {
    const result = apply(state_with_caret('alpha|'), '- a\n- b');
    expect(result.text).toBe('alpha\n- a\n- b\n');
    expect(result.head).toBe(result.text.length);
  });

  it('replaces the selection', () => {
    const state = EditorState.create({
      doc: 'keep DROP keep',
      selection: { anchor: 5, head: 9 },
      extensions: [markdown({ extensions: [GFM] })],
    });
    expect(apply(state, '*x*').text).toBe('keep *x* keep');
    expect(apply(state, '- a\n- b').text).toBe('keep \n- a\n- b\n\n keep');
  });

  it('a multi-block result inside a quote is re-prefixed and stays quoted (BQ-I-13)', () => {
    const result = apply(state_with_caret('> alpha|\n> beta'), '## H\n\ntext');
    expect(result.text).toBe('> alpha\n> ## H\n> \n> text\n> \n> beta');
    expect(result.head).toBe('> alpha\n> ## H\n> \n> text\n> '.length);
  });
});
