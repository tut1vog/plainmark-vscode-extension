import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { editor_extensions } from '../../src/webview/editor_extensions.js';

// Guards PARA-R-7, and its construct mirrors
// BQ-R-13 (quote interiors) and CALL-R-11 (callout bodies): quote and callout
// interiors share the prose paragraph rhythm. Interior blockquote lines (any
// depth), quoted blank lines, callout body lines (minus the first, under the
// header), and quoted list continuations carry the paragraph gap; the first
// line of the outermost quote ALSO carries it when the block is below other
// content (rendered as clear space above the block, tint and bars anchored
// past it), but never on doc line 1. Quoted list marker lines keep
// tight item spacing, and quoted non-prose constructs stay excluded. The
// computed-padding cases pin the (0,4,0) tripled-class cascade win over the
// blockquote per-depth and callout-body padding rules, and the (0,5,0)
// first-line stack over the tripled rule.

const GAP_CLASS = 'plainmark-paragraph-gap';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r(null as never)));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

describe('paragraph gap inside blockquotes and callouts (PARA-R-7)', () => {
  let host: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '600px';
    host.style.height = '400px';
    document.body.appendChild(host);
  });
  afterEach(() => {
    view?.destroy();
    view = undefined;
    host.remove();
  });

  async function mount(doc: string): Promise<HTMLElement[]> {
    view = new EditorView({
      state: EditorState.create({ doc, extensions: [...editor_extensions] }),
      parent: host,
    });
    await frames(4);
    return Array.from(host.querySelectorAll('.cm-content > .cm-line'));
  }

  async function gap_flags(doc: string): Promise<boolean[]> {
    return (await mount(doc)).map((el) => el.classList.contains(GAP_CLASS));
  }

  it('interior quote lines carry the gap; the first line does not', async () => {
    expect(await gap_flags('> a\n> b\n> c')).toEqual([false, true, true]);
  });

  it('a quoted blank line carries the gap like an unquoted one', async () => {
    expect(await gap_flags('> a\n>\n> b')).toEqual([false, true, true]);
  });

  it('a quote after a paragraph carries the gap on its first line', async () => {
    expect(await gap_flags('para\n> a')).toEqual([false, true]);
  });

  it('a gapped quote first line stacks gap + padding-y and bottom-anchors the tint', async () => {
    const lines = await mount('para\n> a');
    // (0,5,0) first-line rule: 12px gap + 4px padding-y = 16px.
    expect(parseFloat(getComputedStyle(lines[1]).paddingTop)).toBeCloseTo(16, 0);
    // The tint skips the gap: bottom-anchored, sized short of the box. The
    // tint COLOR can't be asserted headlessly (the --vscode-* vars the
    // color-mix reads exist only in the real webview), so pin the geometry.
    const style = getComputedStyle(lines[1]);
    expect(style.backgroundPosition.split(' ')[1]).toBe('100%');
    expect(style.backgroundSize).toContain('calc');
  });

  it('a callout after a paragraph carries the gap on its header', async () => {
    expect(await gap_flags('para\n> [!note] t\n> body')).toEqual([false, true, false]);
  });

  it('a gapped callout header stacks gap + padding-y', async () => {
    const lines = await mount('para\n> [!note] t\n> body');
    // (0,5,0) header rule: 12px gap + 8px callout padding-y = 20px.
    expect(parseFloat(getComputedStyle(lines[1]).paddingTop)).toBeCloseTo(20, 0);
  });

  it('adjacent quote/callout lines stay one merged block: no first-line class inside', async () => {
    // `[!note]` mid-quote is body text, not a new callout — the block must not
    // split: line 2 takes the interior (tinted) gap, and only line 1 carries
    // plainmark-blockquote-first.
    const lines = await mount('> a\n> [!note] x');
    expect(lines[0].classList.contains('plainmark-blockquote-first')).toBe(true);
    expect(lines[1].classList.contains('plainmark-blockquote-first')).toBe(false);
    expect(lines[1].classList.contains(GAP_CLASS)).toBe(true);
    // Interior line keeps the full-box tint: the interior gap is the plain
    // tripled-rule 12px, not the first-line 16px stack, and no bottom-anchor
    // applies (background-position keeps its default 0%).
    expect(parseFloat(getComputedStyle(lines[1]).paddingTop)).toBeCloseTo(12, 0);
    expect(getComputedStyle(lines[1]).backgroundPosition.split(' ')[1]).toBe('0%');
  });

  it('stacked callout headers do not split the block either', async () => {
    // Only a quote's FIRST line is callout-detected; a second `[!type]` line
    // renders as body of the first callout, merged.
    const lines = await mount('> [!note] a\n> [!tip] b');
    expect(lines[1].classList.contains('plainmark-callout-header')).toBe(false);
    expect(lines[1].classList.contains('plainmark-callout-body')).toBe(true);
  });

  it('quoted lists follow the unquoted rules: marker lines tight, continuation gapped', async () => {
    expect(await gap_flags('> - a\n> - b\n> next')).toEqual([false, false, true]);
  });

  it('deepening an interior line into a nested quote keeps the gap', async () => {
    expect(await gap_flags('> a\n> > b')).toEqual([false, true]);
  });

  it('a lazy continuation line below a quote carries the gap', async () => {
    expect(await gap_flags('> a\nb')).toEqual([false, true]);
  });

  it('callout body lines carry the gap, except the first one under the header', async () => {
    // Title→content seam stays the header's title-padding-bottom alone
    // (owner smoke 2026-07-20 rejected gap-sized spacing under the icon line).
    expect(await gap_flags('> [!note] title\n> body\n> more')).toEqual([false, false, true]);
  });

  it('an EMPTY first callout body line matches the typed state (no first-keystroke jump)', async () => {
    // The end-of-line probe must lean left to find the Blockquote a
    // prefix-only line terminates — with side 1 the empty body line at doc
    // end resolved to Document, took the prose gap, and typing the first
    // character snapped the line up to the title seam.
    expect(await gap_flags('> [!note] title\n> ')).toEqual([false, false]);
    view?.destroy();
    expect(await gap_flags('> [!note] title\n> x')).toEqual([false, false]);
  });

  it('a trailing empty quote continuation line carries the gap like its typed state', async () => {
    expect(await gap_flags('> a\n> ')).toEqual([false, true]);
    view?.destroy();
    expect(await gap_flags('> a\n> b')).toEqual([false, true]);
  });

  it('a fenced code block inside a quote stays excluded', async () => {
    expect(await gap_flags('> a\n> ```\n> code\n> ```')).toEqual([false, false, false, false]);
  });

  it('the gap padding beats the blockquote per-depth padding-top in the cascade', async () => {
    const lines = await mount('> a\n> b');
    const first = parseFloat(getComputedStyle(lines[0]).paddingTop);
    const second = parseFloat(getComputedStyle(lines[1]).paddingTop);
    // First line: --plainmark-blockquote-padding-y (0.25em = 4px at 16px).
    // Interior line: --plainmark-paragraph-gap (0.75em = 12px), not 4px.
    expect(first).toBeCloseTo(4, 0);
    expect(second).toBeCloseTo(12, 0);
  });

  it('the gap padding beats the callout-body padding-top reset in the cascade', async () => {
    const lines = await mount('> [!note] title\n> body\n> more');
    // First body line: no gap — callout-body padding reset (0px) applies.
    expect(parseFloat(getComputedStyle(lines[1]).paddingTop)).toBeCloseTo(0, 0);
    // Later body lines: the gap (0.75em = 12px) wins over the reset.
    expect(parseFloat(getComputedStyle(lines[2]).paddingTop)).toBeCloseTo(12, 0);
  });
});
