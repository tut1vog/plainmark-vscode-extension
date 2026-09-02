// Paste-table conversion (TBL-I-35 / TBL-I-36 / TBL-I-37): the HTML branch
// needs a real DOMParser, so its unit coverage lives in this browser tier;
// the pure TSV branch is tier-a (src/webview/paste_table.test.ts). The
// end-to-end dispatch path reuses the paste-flow harness shape.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';
import { table_markdown_from_html } from '../../../src/webview/paste_table.js';

describe('TBL-I-36 table_markdown_from_html qualification gate', () => {
  it('converts a single-table payload; first <tr> is the header', () => {
    const md = table_markdown_from_html(
      '<table><tr><th>H1</th><th>H2</th></tr><tr><td>a</td><td>b</td></tr></table>',
    );
    expect(md).not.toBeNull();
    const lines = (md as string).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('H1');
    expect(lines[1]).toMatch(/^\| -+ /);
    expect(lines[2]).toContain('| a');
  });

  it('maps inline markup to markdown source in cells', () => {
    const md = table_markdown_from_html(
      '<table><tr><th>k</th><th>v</th></tr>' +
        '<tr><td><b>bold</b> and <em>it</em></td><td><a href="https://e.test/p">link</a></td></tr>' +
        '<tr><td><code>x|y</code></td><td>a<br>b</td></tr></table>',
    );
    expect(md).toContain('**bold** and *it*');
    expect(md).toContain('[link](https://e.test/p)');
    expect(md).toContain('`x\\|y`');
    expect(md).toContain('a<br>b');
  });

  it('survives spreadsheet-style wrapping (thead/tbody, meta, whitespace)', () => {
    const md = table_markdown_from_html(
      '<meta charset="utf-8"><table>\n  <thead>\n    <tr><th>方法</th><th>代价</th></tr>\n  </thead>\n' +
        '  <tbody>\n    <tr><td>引用计数</td><td>循环引用</td></tr>\n  </tbody>\n</table>',
    );
    expect(md).not.toBeNull();
    expect((md as string).split('\n')[0]).toContain('方法');
  });

  it('ignores a body-level <style> when gating (Google Sheets payload shape)', () => {
    const md = table_markdown_from_html(
      '<meta charset="utf-8"><google-sheets-html-origin>' +
        '<style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style>' +
        '<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" data-sheets-root="1">' +
        '<colgroup><col width="100"/><col width="100"/></colgroup>' +
        '<tbody><tr style="height:21px;"><td><b>Name</b></td><td>Value</td></tr>' +
        '<tr><td><a href="https://e.test/p">link</a></td><td>2</td></tr></tbody></table>' +
        '</google-sheets-html-origin>',
    );
    expect(md).not.toBeNull();
    expect(md).toContain('**Name**');
    expect(md).toContain('[link](https://e.test/p)');
  });

  it('declines non-whitespace content outside the table', () => {
    expect(
      table_markdown_from_html('<p>intro</p><table><tr><td>a</td><td>b</td></tr></table>'),
    ).toBeNull();
  });

  it('declines multiple/nested tables, spans, and a single cell', () => {
    const one = '<table><tr><td>a</td><td>b</td></tr></table>';
    expect(table_markdown_from_html(one + one)).toBeNull();
    expect(
      table_markdown_from_html(
        '<table><tr><td colspan="2">a</td></tr><tr><td>b</td><td>c</td></tr></table>',
      ),
    ).toBeNull();
    expect(table_markdown_from_html('<table><tr><td>only</td></tr></table>')).toBeNull();
    expect(table_markdown_from_html('no table at all')).toBeNull();
  });

  it('declines ragged rows (unequal cell counts, no spans)', () => {
    expect(
      table_markdown_from_html(
        '<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>',
      ),
    ).toBeNull();
  });
});

describe('TBL-I-35 paste dispatch inserts the converted table on its own lines', () => {
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
    delete window.__plainmark_paste_table_conversion;
  });

  function paste(text_plain: string, text_html?: string): void {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: SEED_DOC },
      selection: { anchor: CARET_OFFSET },
    });
    view.contentDOM.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', text_plain);
    if (text_html !== undefined) dt.setData('text/html', text_html);
    view.contentDOM.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }

  it('TSV paste lands a pipe table with the caret on the line after it', () => {
    paste('A\tB\nC\tD');
    const text = view.state.doc.toString();
    expect(text).toContain('First paragraph.\n| A   | B   |\n| --- | --- |\n| C   | D   |\n');
    const table_end = text.indexOf('| C   | D   |') + '| C   | D   |'.length;
    expect(view.state.selection.main.head).toBe(table_end + 1);
  });

  it('a mid-word paste separates the table from the line remainder with a blank line', () => {
    // Caret inside "paragraph." — the remainder must not be absorbed as a table row.
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: SEED_DOC },
      selection: { anchor: CARET_OFFSET - 4 },
    });
    view.contentDOM.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', 'A\tB\nC\tD');
    view.contentDOM.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
    expect(view.state.doc.toString()).toContain('| C   | D   |\n\naph.');
  });

  it('the HTML flavor wins over the TSV flavor (formatting kept)', () => {
    paste('A\tB\nC\tD', '<table><tr><th>A</th><th>B</th></tr><tr><td><b>C</b></td><td>D</td></tr></table>');
    expect(view.state.doc.toString()).toContain('**C**');
  });

  it('TBL-I-37: a false injected flag disables conversion (literal paste)', () => {
    window.__plainmark_paste_table_conversion = false;
    paste('A\tB\nC\tD');
    const text = view.state.doc.toString();
    expect(text).toContain('First paragraph.A\tB\nC\tD');
    expect(text).not.toContain('| A ');
  });

  it('a non-qualifying payload falls through to the default plain-text paste', () => {
    paste('plain prose, no tabs');
    expect(view.state.doc.toString()).toContain('First paragraph.plain prose, no tabs');
  });
});
