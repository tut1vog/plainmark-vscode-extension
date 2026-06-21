import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { build_inline_decorations, build_registry } from './inline_decorations.js';
import { html_handlers } from './html.js';

function make_state(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor },
  });
}

interface DecoSnapshot {
  from: number;
  to: number;
  class: string | undefined;
}

const registry = build_registry(html_handlers);

function snapshot(state: EditorState): DecoSnapshot[] {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    registry,
  );
  const out: DecoSnapshot[] = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    const spec = deco.spec as { class?: string };
    out.push({ from, to, class: spec.class });
  });
  out.sort((a, b) => a.from - b.from);
  return out;
}

describe('html decoration handler — block HTML-R-1 HTML-R-3 HTML-SP-1', () => {
  it('emits .plainmark-html-block line decoration for a single-line generic HTMLBlock', () => {
    const doc = '<div>hello</div>\n\nfollow-up paragraph.\n';
    const out = snapshot(make_state(doc, doc.length));
    const block_lines = out.filter((d) => d.class === 'plainmark-html-block');
    expect(block_lines.length).toBeGreaterThanOrEqual(1);
    expect(block_lines[0].from).toBe(0);
  });

  it('emits one line decoration per line of a multi-line HTMLBlock', () => {
    const doc = '<div>\n  <p>inner</p>\n</div>\n\nProse.\n';
    const out = snapshot(make_state(doc, doc.length));
    const block_lines = out.filter((d) => d.class === 'plainmark-html-block');
    expect(block_lines.length).toBe(3);
  });

  it('emits chrome on CommentBlock (`<!-- ... -->`)', () => {
    const doc = '<!-- a multi\nline comment -->\n\nfollow.\n';
    const out = snapshot(make_state(doc, doc.length));
    const block_lines = out.filter((d) => d.class === 'plainmark-html-block');
    expect(block_lines.length).toBeGreaterThanOrEqual(2);
  });

  it('emits chrome on ProcessingInstructionBlock (`<? ... ?>`)', () => {
    const doc = '<?php echo "x"; ?>\n\nfollow.\n';
    const out = snapshot(make_state(doc, doc.length));
    const block_lines = out.filter((d) => d.class === 'plainmark-html-block');
    expect(block_lines.length).toBeGreaterThanOrEqual(1);
  });

  it('emits chrome on a <script> HTMLBlock (CommonMark §4.6 type 1)', () => {
    const doc = '<script>console.log(1);</script>\n\nfollow.\n';
    const out = snapshot(make_state(doc, doc.length));
    const block_lines = out.filter((d) => d.class === 'plainmark-html-block');
    expect(block_lines.length).toBeGreaterThanOrEqual(1);
  });
});

describe('html decoration handler — inline HTML-R-2 HTML-E-1', () => {
  it('emits .plainmark-html-inline mark for each inline HTMLTag in a paragraph', () => {
    const doc = 'Hello <sub>x</sub> world.\n';
    const out = snapshot(make_state(doc, 0));
    const inline_marks = out.filter((d) => d.class === 'plainmark-html-inline');
    expect(inline_marks.length).toBe(2);
    expect(doc.slice(inline_marks[0].from, inline_marks[0].to)).toBe('<sub>');
    expect(doc.slice(inline_marks[1].from, inline_marks[1].to)).toBe('</sub>');
  });

  it('emits .plainmark-html-inline mark for self-closing tags (e.g. <br/>)', () => {
    const doc = 'line one<br/>line two\n';
    const out = snapshot(make_state(doc, 0));
    const inline_marks = out.filter((d) => d.class === 'plainmark-html-inline');
    expect(inline_marks.length).toBe(1);
    expect(doc.slice(inline_marks[0].from, inline_marks[0].to)).toBe('<br/>');
  });

  it('does NOT emit inline mark on paragraph plain text without HTML', () => {
    const doc = 'Plain prose with no HTML.\n';
    const out = snapshot(make_state(doc, 0));
    expect(out).toEqual([]);
  });

  it('emits inline mark for inline Comment (`<!-- ... -->` mid-paragraph)', () => {
    const doc = 'before <!-- mid-line comment --> after.\n';
    const out = snapshot(make_state(doc, 0));
    const inline_marks = out.filter((d) => d.class === 'plainmark-html-inline');
    expect(inline_marks.length).toBe(1);
    expect(doc.slice(inline_marks[0].from, inline_marks[0].to)).toBe(
      '<!-- mid-line comment -->',
    );
  });
});

describe('html decoration handler — block vs inline isolation HTML-E-2', () => {
  it('a paragraph after an HTMLBlock receives no html-inline marks for its prose', () => {
    const doc = '<div>block</div>\n\nProse with no tags.\n';
    const out = snapshot(make_state(doc, doc.length));
    const inline_marks = out.filter((d) => d.class === 'plainmark-html-inline');
    expect(inline_marks).toEqual([]);
  });

  it('mixed block and inline both emit their own chrome', () => {
    const doc = '<div>x</div>\n\nprose with <kbd>Ctrl+C</kbd>.\n';
    const out = snapshot(make_state(doc, doc.length));
    const block_lines = out.filter((d) => d.class === 'plainmark-html-block');
    const inline_marks = out.filter((d) => d.class === 'plainmark-html-inline');
    expect(block_lines.length).toBeGreaterThanOrEqual(1);
    expect(inline_marks.length).toBe(2);
  });
});
