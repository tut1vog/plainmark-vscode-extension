import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { editor_extensions } from '../../src/webview/editor_extensions.js';

// Guards PARA-R-7 as amended by ADR-0007: quote and callout interiors share
// the prose paragraph rhythm. Interior blockquote lines (any depth), quoted
// blank lines, callout body lines, and quoted list continuations carry the
// paragraph gap; the first line of the outermost quote keeps only the block's
// own padding (no tinted band above the first paragraph), quoted list marker
// lines keep tight item spacing, and quoted non-prose constructs stay
// excluded. The computed-padding cases pin the (0,4,0) tripled-class cascade
// win over the blockquote per-depth and callout-body padding rules.

const GAP_CLASS = 'plainmark-paragraph-gap';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r(null as never)));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

describe('paragraph gap inside blockquotes and callouts (PARA-R-7 / ADR-0007)', () => {
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

  it('a quote after a paragraph keeps its first line gap-free (block padding only)', async () => {
    expect(await gap_flags('para\n> a')).toEqual([false, false]);
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

  it('callout body lines carry the gap; the header line does not', async () => {
    expect(await gap_flags('> [!note] title\n> body\n> more')).toEqual([false, true, true]);
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
    const lines = await mount('> [!note] title\n> body');
    expect(parseFloat(getComputedStyle(lines[1]).paddingTop)).toBeCloseTo(12, 0);
  });
});
