// Rich-text paste conversion (PASTE-H-1..H-6): the HTML mapper needs a real
// DOMParser, so its unit coverage lives in this browser tier; the pure
// placement/caret logic is tier-a (src/webview/paste_rich_text.test.ts).

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editor_extensions } from '../../src/webview/editor_extensions.js';
import { markdown_from_html } from '../../src/webview/html_to_markdown.js';

const KATEX_INLINE =
  '<span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow>' +
  '<annotation encoding="application/x-tex">E = mc^2</annotation></semantics></math></span>' +
  '<span class="katex-html" aria-hidden="true"><span class="base">E</span><span class="base">=mc<span class="msupsub">2</span></span></span></span>';

describe('PASTE-H-1 markdown_from_html qualification gate', () => {
  it('declines a VS Code editor copy (colour spans in divs, no semantic tags)', () => {
    expect(
      markdown_from_html(
        '<div style="color: #d4d4d4;background-color: #1e1e1e;font-family: Menlo;white-space: pre;">' +
          '<div><span style="color: #569cd6;">const</span> x = <span style="color: #b5cea8;">1</span>;</div></div>',
      ),
    ).toBeNull();
  });

  it('declines a Google Docs paragraph (style-mapped spans inside a neutralized <b>)', () => {
    expect(
      markdown_from_html(
        '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1">' +
          '<p dir="ltr"><span style="font-weight:700;">Bold</span> <span style="font-style:italic;">it</span> text</p></b>',
      ),
    ).toBeNull();
  });

  it('declines bare paragraphs, divs, and line breaks', () => {
    expect(markdown_from_html('<p>one</p><p>two<br>three</p>')).toBeNull();
    expect(markdown_from_html('<div>outer<div>inner</div></div>')).toBeNull();
    expect(markdown_from_html('')).toBeNull();
  });

  it('converts once any semantic element is present', () => {
    expect(markdown_from_html('<p>a <em>b</em></p>')).toBe('a *b*');
    expect(markdown_from_html('<p>a</p><hr><p>b</p>')).toBe('a\n\n---\n\nb');
  });
});

describe('PASTE-H-2 block mapping', () => {
  it('maps a chat answer: heading plus bullets with bold lead-ins', () => {
    expect(
      markdown_from_html(
        '<h2>Options</h2><ul><li><p><strong>Option A</strong> — fastest to ship.</p></li>' +
          '<li><p><strong>Option B</strong> — safest, slower.</p></li></ul>',
      ),
    ).toBe('## Options\n\n- **Option A** — fastest to ship.\n- **Option B** — safest, slower.');
  });

  it('indents a nested list to the parent marker content column', () => {
    expect(
      markdown_from_html(
        '<ol><li>Install<ul><li>run <code>pnpm i</code></li></ul></li><li>Build</li></ol>',
      ),
    ).toBe('1. Install\n   - run `pnpm i`\n2. Build');
  });

  it('honours an ordered start and a list nested without its own <li>', () => {
    expect(markdown_from_html('<ol start="3"><li>c</li><li>d</li></ol>')).toBe('3. c\n4. d');
    expect(markdown_from_html('<ul><li>a</li><ul><li>b</li></ul></ul>')).toBe('- a\n  - b');
  });

  it('maps task-list checkboxes', () => {
    expect(
      markdown_from_html(
        '<ul><li><input type="checkbox" checked disabled> done</li><li><input type="checkbox"> todo</li></ul>',
      ),
    ).toBe('- [x] done\n- [ ] todo');
  });

  it('prefixes every blockquote line, blank interior lines included', () => {
    expect(markdown_from_html('<blockquote><p>one</p><p>two</p></blockquote>')).toBe(
      '> one\n>\n> two',
    );
    expect(
      markdown_from_html('<blockquote><blockquote><p>deep</p></blockquote></blockquote>'),
    ).toBe('> > deep');
  });

  it('fences a code block from its <code> child, dropping toolbar chrome, keeping the language', () => {
    expect(
      markdown_from_html(
        '<pre class="overflow-visible"><div><div class="header">typescript</div><button>Copy code</button>' +
          '<div class="overflow-y-auto"><code class="whitespace-pre language-typescript">const x = 1;\nexport default x;\n</code></div></div></pre>',
      ),
    ).toBe('```typescript\nconst x = 1;\nexport default x;\n```');
  });

  it('lengthens the fence past a backtick run inside the code', () => {
    expect(markdown_from_html('<pre><code>a\n```\nb</code></pre>')).toBe('````\na\n```\nb\n````');
  });

  it('converts a table inside prose (the lone-table gate no longer applies)', () => {
    const md = markdown_from_html(
      '<p>Compare:</p><table><tr><th>Name</th><th>Cost</th></tr><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></table>',
    );
    expect(md).not.toBeNull();
    expect((md as string).startsWith('Compare:\n\n| Name')).toBe(true);
    expect(md).toContain('| B ');
  });

  it('falls back to space-joined rows for a table the converter declines', () => {
    expect(
      markdown_from_html(
        '<p>x</p><table><tr><td colspan="2">head</td></tr><tr><td>a</td><td>b</td></tr></table>',
      ),
    ).toBe('x\n\nhead\na b');
  });

  it('keeps a remote image link and reduces a data: image to its alt text', () => {
    expect(markdown_from_html('<p><img src="https://e.test/i.png" alt="pic"></p>')).toBe(
      '![pic](https://e.test/i.png)',
    );
    expect(
      markdown_from_html('<p><b>x</b> <img src="data:image/png;base64,AAAA" alt="pic"></p>'),
    ).toBe('**x** pic');
  });

  it('walks an inline wrapper around blocks as a container (Google Docs list payload)', () => {
    expect(
      markdown_from_html(
        '<b style="font-weight:normal;" id="docs-internal-guid-2"><ul><li><p><span>first</span></p></li><li><p><span>second</span></p></li></ul></b>',
      ),
    ).toBe('- first\n- second');
  });
});

describe('PASTE-H-3 inline mapping', () => {
  it('maps emphasis, strike, code, and links', () => {
    expect(
      markdown_from_html(
        '<p>Use <strong>pnpm</strong> here; the <em>lockfile</em> pins <code>vsce</code>, <s>npm</s> is <a href="https://e.test/p">gone</a>.</p>',
      ),
    ).toBe('Use **pnpm** here; the *lockfile* pins `vsce`, ~~npm~~ is [gone](https://e.test/p).');
  });

  it('lengthens a code span past a backtick in its content', () => {
    expect(markdown_from_html('<p><code>a`b</code></p>')).toBe('``a`b``');
  });

  it('turns an empty-label link into a bare autolink', () => {
    expect(markdown_from_html('<p>see <a href="https://e.test/"></a></p>')).toBe(
      'see <https://e.test/>',
    );
  });

  it('maps KaTeX to dollar math from the TeX annotation, inline and display', () => {
    expect(markdown_from_html(`<p>Energy: ${KATEX_INLINE} holds.</p>`)).toBe(
      'Energy: $E = mc^2$ holds.',
    );
    expect(
      markdown_from_html(`<p>before</p><p><span class="katex-display">${KATEX_INLINE}</span></p>`),
    ).toBe('before\n\n$$E = mc^2$$');
  });

  it('treats a font-weight:normal <b> as transparent and unmapped inline tags as text', () => {
    expect(
      markdown_from_html(
        '<b style="font-weight:normal"><p><u>u</u> <sup>2</sup> <kbd>k</kbd> <i>real</i></p></b>',
      ),
    ).toBe('u 2 k *real*');
  });
});

describe('PASTE-H-4 output shape', () => {
  it('collapses whitespace, drops empty blocks, and separates blocks with one blank line', () => {
    expect(
      markdown_from_html(
        '<h1>\n  Title  </h1>\n<p></p>\n<p>one\n  two&nbsp;three</p>\n\n<p>   </p><p>four<br>five</p>',
      ),
    ).toBe('# Title\n\none two three\n\nfour\nfive');
  });

  it('shifts emphasis markers off surrounding whitespace', () => {
    expect(markdown_from_html('<p>a<strong> b </strong>c</p>')).toBe('a **b** c');
  });
});

describe('PASTE-C-1 PASTE-H-5 paste dispatch inserts the converted markdown', () => {
  const SEED_DOC = '# Heading\n\nFirst paragraph.\n\nSecond paragraph.\n';
  const CARET_OFFSET = SEED_DOC.indexOf('First paragraph.') + 'First paragraph.'.length;
  let container: HTMLElement;
  let view: EditorView;

  beforeAll(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    view = new EditorView({
      state: EditorState.create({ doc: SEED_DOC, extensions: [...editor_extensions] }),
      parent: container,
    });
  });

  afterAll(() => {
    view?.destroy();
    container?.remove();
  });

  afterEach(() => {
    delete window.__plainmark_paste_rich_text;
  });

  function paste(
    text_plain: string,
    text_html: string,
    doc = SEED_DOC,
    caret = CARET_OFFSET,
  ): void {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
      selection: { anchor: caret },
    });
    view.contentDOM.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', text_plain);
    dt.setData('text/html', text_html);
    view.contentDOM.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }

  it('a lone paragraph pastes inline at the caret', () => {
    paste('Use pnpm here.', '<p>Use <strong>pnpm</strong> here.</p>');
    expect(view.state.doc.toString()).toContain('First paragraph.Use **pnpm** here.');
  });

  it('a multi-block answer lands on its own lines with the caret on the line below', () => {
    paste('Options\nOption A', '<h2>Options</h2><ul><li><b>Option A</b></li></ul>');
    const text = view.state.doc.toString();
    expect(text).toContain('First paragraph.\n## Options\n\n- **Option A**\n\nSecond paragraph.');
    expect(view.state.selection.main.head).toBe(
      text.indexOf('- **Option A**') + '- **Option A**\n'.length,
    );
  });

  it('a table inside prose converts here after the lone-table handler declines', () => {
    paste(
      'Compare:\nA\t1',
      '<p>Compare:</p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
    );
    const text = view.state.doc.toString();
    expect(text).toContain('First paragraph.\nCompare:\n\n| A ');
    expect(text.match(/\| A /g)).toHaveLength(1);
  });

  it('a multi-block paste inside a quote stays quoted (BQ-I-13)', () => {
    const doc = '> alpha\n> beta\n';
    paste('H\ntext', '<h2>H</h2><p>text</p>', doc, '> alpha'.length);
    expect(view.state.doc.toString()).toBe('> alpha\n> ## H\n> \n> text\n> \n> beta\n');
  });

  it('PASTE-H-6: a false injected flag disables conversion (plain-text paste)', () => {
    window.__plainmark_paste_rich_text = false;
    paste('Use pnpm here.', '<p>Use <strong>pnpm</strong> here.</p>');
    expect(view.state.doc.toString()).toContain('First paragraph.Use pnpm here.');
  });

  it('a payload without formatting falls through to the default plain-text paste', () => {
    paste('const x = 1;', '<div><span style="color:#569cd6">const</span> x = 1;</div>');
    expect(view.state.doc.toString()).toContain('First paragraph.const x = 1;');
  });
});
