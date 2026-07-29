import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { editor_extensions } from '../../src/webview/editor_extensions.js';

// Guards PARA-R-13: a blank line owns its seam's single gap. The line
// directly below a blank — prose, marker, construct start, or another
// blank — takes none, so a `\n\n` seam costs one gap (not two) and blank
// runs compact after the first. "Blank" spans the lexical quote prefix, so
// `>` separator lines count inside quotes. Eligibility stays line-above
// local (PARA-R-12): editing the line above is the only way to flip a
// line's gap.

const GAP_CLASS = 'plainmark-paragraph-gap';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r(null as never)));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

describe('blank line owns the seam gap (PARA-R-13)', () => {
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

  async function mount(doc: string, anchor = 0): Promise<HTMLElement[]> {
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor },
        extensions: [...editor_extensions],
      }),
      parent: host,
    });
    await frames(4);
    return Array.from(host.querySelectorAll('.cm-content > .cm-line'));
  }

  async function gap_flags(doc: string, anchor = 0): Promise<boolean[]> {
    return (await mount(doc, anchor)).map((el) => el.classList.contains(GAP_CLASS));
  }

  it('a \\n\\n seam costs one gap: the blank carries it, the line below is bare', async () => {
    expect(await gap_flags('a\n\nb')).toEqual([false, true, false]);
  });

  it('a single-\\n seam keeps its gap (PARA-E-5 unchanged)', async () => {
    expect(await gap_flags('a\nb')).toEqual([false, true]);
  });

  it('a blank run compacts after its first line', async () => {
    expect(await gap_flags('a\n\n\n\nb')).toEqual([false, true, false, false, false]);
  });

  it('a doc-top blank line leaves line 2 bare (doc-top region has no seam)', async () => {
    expect(await gap_flags('\nb')).toEqual([false, false]);
  });

  it('a heading below a blank reverts to its non-gapped scaled breathing', async () => {
    const flags = await gap_flags('a\n\n# h');
    expect(flags).toEqual([false, true, false]);
    const lines = await mount('a\n\n# h');
    // HEAD-R-9 non-gapped path: 0.4em in the h1 context = 0.4 * 32px = 12.8px.
    expect(parseFloat(getComputedStyle(lines[2]).paddingTop)).toBeCloseTo(12.8, 0);
  });

  it('a loose-list marker below the blank yields the seam to it', async () => {
    expect(await gap_flags('- a\n\n- b')).toEqual([false, true, false]);
  });

  it('a quote-prefix-only line is a blank seam inside the quote', async () => {
    expect(await gap_flags('> a\n>\n> b')).toEqual([false, true, false]);
  });

  it('typing on the blank line hands the gap back to the line below', async () => {
    const lines = await mount('a\n\nb');
    expect(lines[2].classList.contains(GAP_CLASS)).toBe(false);
    view!.dispatch({ changes: { from: 2, insert: 'x' } });
    await frames(4);
    const after = Array.from(host.querySelectorAll('.cm-content > .cm-line'));
    // The seam dissolved (no blank above), so `b` re-takes its PARA-E-5 gap.
    expect(after.map((el) => el.classList.contains(GAP_CLASS))).toEqual([false, true, true]);
  });
});
