import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { editor_extensions } from '../../src/webview/editor_extensions.js';

// Guards PARA-R-7 as amended by ADR-0010: the FIRST line of every non-prose
// block construct (fenced/indented code, HTML blocks, headings, HR, tables,
// block math) joins the paragraph rhythm when the block sits below other
// content — never on doc line 1, never inside a quote (BQ-R-13). Interior
// construct lines stay gap-free. Constructs with a tinted line background
// render the gap as clear space (background bottom-anchored past the gap);
// constructs with their own breathing room stack the gap on it at (0,5,0).
// Table and block math render as block widgets when the caret is outside —
// there the gap is widget padding keyed on `plainmark-block-gap-above`.

const GAP_CLASS = 'plainmark-paragraph-gap';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r(null as never)));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

describe('paragraph gap above block constructs (PARA-R-7 / ADR-0010)', () => {
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

  describe('fenced code (CBLK-R-2 CBLK-R-5)', () => {
    it('carries the gap on the opening fence after a paragraph; interior lines stay tight', async () => {
      expect(await gap_flags('para\n```js\ncode\n```')).toEqual([false, true, false, false]);
    });

    it('two adjacent fences separate: the second opening fence carries the gap', async () => {
      expect(await gap_flags('```\na\n```\n```\nb\n```')).toEqual([
        false,
        false,
        false,
        true,
        false,
        false,
      ]);
    });

    it('a doc-top fence takes no gap', async () => {
      expect(await gap_flags('```\na\n```')).toEqual([false, false, false]);
    });

    it('a gapped fence header bottom-anchors the code background past the gap', async () => {
      const lines = await mount('para\n```js\ncode\n```');
      const style = getComputedStyle(lines[1]);
      // Tripled gap rule: 12px padding-top; background skips it (y = bottom).
      expect(parseFloat(style.paddingTop)).toBeCloseTo(12, 0);
      expect(style.backgroundPosition.split(' ')[1]).toBe('100%');
    });
  });

  describe('indented code (CBLK-R-5)', () => {
    it('stacks the gap on the block’s own tinted top padding', async () => {
      const flags = await gap_flags('para\n\n    code');
      expect(flags).toEqual([false, true, true]);
      const lines = await mount('para\n\n    code');
      // (0,5,0): 12px gap + 8px --plainmark-fenced-code-padding-y = 20px.
      expect(parseFloat(getComputedStyle(lines[2]).paddingTop)).toBeCloseTo(20, 0);
      expect(getComputedStyle(lines[2]).backgroundPosition.split(' ')[1]).toBe('100%');
    });
  });

  describe('headings and horizontal rules (HEAD-R-9 HR-R-6)', () => {
    it('a heading after a paragraph carries exactly the base-size gap', async () => {
      expect(await gap_flags('para\n# h')).toEqual([false, true]);
      const lines = await mount('para\n# h');
      // (0,5,0) heading rule (ADR-0012): a gapped heading takes the base-size
      // gap alone — no breathing stack; the per-level divisor cancels the em
      // context: (0.75 / 2) * 32px = 12px, the same rhythm as every block.
      expect(parseFloat(getComputedStyle(lines[1]).paddingTop)).toBeCloseTo(12, 0);
    });

    it('adjacent headings keep a single (gap-sourced) seam', async () => {
      expect(await gap_flags('# a\n## b')).toEqual([false, true]);
    });

    it('a non-gapped (doc-top) heading keeps its own scaled breathing', async () => {
      const lines = await mount('# h');
      // --plainmark-heading-padding-top still governs non-gapped headings
      // (ADR-0012): 0.4em in the h1 context = 0.4 * 32px = 12.8px.
      expect(parseFloat(getComputedStyle(lines[0]).paddingTop)).toBeCloseTo(12.8, 0);
    });

    it('an HR after a paragraph carries the gap and re-centres its bar', async () => {
      expect(await gap_flags('para\n***')).toEqual([false, true]);
      const lines = await mount('para\n***');
      // (0.75em + 0.4em) * 16px = 18.4px.
      expect(parseFloat(getComputedStyle(lines[1]).paddingTop)).toBeCloseTo(18.4, 0);
    });
  });

  describe('HTML blocks (HTML-R-4)', () => {
    it('carries the gap on the block’s first line only', async () => {
      expect(await gap_flags('para\n<div>\nx\n</div>')).toEqual([false, true, false, false]);
    });

    it('bottom-anchors the HTML background past the gap', async () => {
      const lines = await mount('para\n<div>\nx\n</div>');
      const style = getComputedStyle(lines[1]);
      // Gap resolves in the block's 0.9em font context: 0.75 * 14.4 = 10.8px.
      expect(parseFloat(style.paddingTop)).toBeCloseTo(10.8, 0);
      expect(style.backgroundPosition.split(' ')[1]).toBe('100%');
    });
  });

  describe('quoted constructs stay gap-free (BQ-R-13)', () => {
    it('a quoted heading / HR on an interior line takes no gap', async () => {
      expect(await gap_flags('> a\n> # h')).toEqual([false, false]);
      view?.destroy();
      expect(await gap_flags('> a\n> ***')).toEqual([false, false]);
    });

    it('a quote whose FIRST line is a construct still gaps as a quote', async () => {
      // The gap belongs to the outermost quote's first line regardless of what
      // that line contains — block separation, not quoted-construct rhythm.
      const lines = await mount('para\n> # h');
      expect(lines[1].classList.contains(GAP_CLASS)).toBe(true);
      expect(lines[1].classList.contains('plainmark-blockquote-first')).toBe(true);
    });
  });

  describe('block widgets (TBL-R-10 MATH-R-7)', () => {
    it('a non-doc-top table widget carries plainmark-block-gap-above', async () => {
      await mount('para\n\n| a |\n| - |\n| b |');
      const widget = host.querySelector('.plainmark-table-block');
      expect(widget).not.toBeNull();
      expect(widget!.classList.contains('plainmark-block-gap-above')).toBe(true);
      // 12px gap + 8px --plainmark-table-margin top = 20px.
      expect(parseFloat(getComputedStyle(widget!).paddingTop)).toBeCloseTo(20, 0);
    });

    it('a doc-top table widget takes no gap padding', async () => {
      await mount('| a |\n| - |\n| b |');
      const widget = host.querySelector('.plainmark-table-block');
      expect(widget).not.toBeNull();
      expect(widget!.classList.contains('plainmark-block-gap-above')).toBe(false);
    });

    it('a non-doc-top math block widget carries plainmark-block-gap-above', async () => {
      await mount('para\n\n$$\nx\n$$');
      const widget = host.querySelector('.plainmark-math-block');
      expect(widget).not.toBeNull();
      expect(widget!.classList.contains('plainmark-block-gap-above')).toBe(true);
    });

    it('a doc-top math block widget takes none', async () => {
      // Caret parked in the trailing paragraph so the block widgetizes
      // (caret inside the $$ range would reveal the source instead).
      await mount('$$\nx\n$$\n\ntail', 12);
      const widget = host.querySelector('.plainmark-math-block');
      expect(widget).not.toBeNull();
      expect(widget!.classList.contains('plainmark-block-gap-above')).toBe(false);
    });

    it('revealed math source carries the gap on its opening $$ line only', async () => {
      // Caret inside the block reveals the source lines (preview widget below).
      expect(await gap_flags('para\n\n$$\nx\n$$', 8)).toEqual([false, true, true, false, false]);
    });
  });
});
