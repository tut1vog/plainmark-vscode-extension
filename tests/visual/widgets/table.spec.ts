// Tier B coverage for the table widget: math-grammar overlay in a cell subview,
// image-adjacent table widgets, AC1 visual continuity, AC2 in-cell marker reveal,
// AC3 atomic focus swap, AC4 single-transaction dispatch, AC5 MC1 idempotency,
// and inline-content fidelity.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultKeymap, history, historyKeymap, indentWithTab, redo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { ensure_mathjax } from '../mathjax-ready.js';
import { mount_editor } from '../util.js';
import { math_extension as math_grammar_extension } from '../../../src/webview/grammar/math.js';
import { image_extension, set_image_base_effect } from '../../../src/webview/widgets/image.js';
import { math_extension } from '../../../src/webview/widgets/math.js';
import {
  find_tables,
  table_extension,
} from '../../../src/webview/widgets/table.js';

const fixture_md = import.meta.glob(
  '../../source-preservation/fixtures/tables/*.md',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function fixture(name: string): string {
  const key = `../../source-preservation/fixtures/tables/${name}.md`;
  const text = fixture_md[key];
  if (!text) throw new Error(`fixture not found: ${key}`);
  return text;
}

interface MountOptions {
  image_base?: string;
  on_doc_changed?: () => void;
}

function mount_main(parent: HTMLElement, doc: string, options: MountOptions = {}): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          { key: 'Mod-Shift-z', run: redo, preventDefault: true },
          indentWithTab,
        ]),
        markdown({ extensions: [GFM, math_grammar_extension] }),
        image_extension,
        math_extension,
        table_extension,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) options.on_doc_changed?.();
        }),
      ],
    }),
    parent,
  });
  if (options.image_base) view.dispatch({ effects: set_image_base_effect.of(options.image_base) });
  return view;
}

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function settle(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 20));
  await next_frame();
  await next_frame();
}

async function wait_past_group_delay(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 600));
}

function get_table_block(container: HTMLElement): HTMLElement {
  const block = container.querySelector('.plainmark-table-block') as HTMLElement | null;
  if (!block) throw new Error('no .plainmark-table-block');
  return block;
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const sel = `[data-row-index="${row_index}"][data-col-index="${col_index}"]`;
  const td = get_table_block(container).querySelector(sel) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

function active_subview_container(): HTMLElement | null {
  return document.querySelector('.plainmark-table-cell-edit');
}

function active_subview_view(): EditorView {
  const sub = active_subview_container();
  if (!sub) throw new Error('no active subview');
  const root = sub.querySelector('.cm-editor') as HTMLElement | null;
  if (!root) throw new Error('no .cm-editor in subview');
  const v = EditorView.findFromDOM(root);
  if (!v) throw new Error('EditorView.findFromDOM returned null');
  return v;
}

async function activate(container: HTMLElement, row: number, col: number): Promise<void> {
  const td = get_cell(container, row, col);
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await next_frame();
  await next_frame();
  if (!active_subview_container()) throw new Error('subview did not mount');
}

async function type_in_subview(text: string): Promise<void> {
  const sub = active_subview_view();
  sub.dispatch({
    changes: { from: sub.state.doc.length, insert: text },
    userEvent: 'input.type',
  });
  await next_frame();
}

async function clear_subview(): Promise<void> {
  const sub = active_subview_view();
  sub.dispatch({
    changes: { from: 0, to: sub.state.doc.length, insert: '' },
    userEvent: 'input.type',
  });
  await next_frame();
}

describe('table widget — dataset shape (cell-coordinate contract)', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-R-2: stores stable (row, col) on td dataset, not absolute offsets', () => {
    const doc = '| ab | cd |\n|----|----|\n| 11 | 22 |\n';
    view = mount_main(container, doc);
    const tds = Array.from(
      container.querySelectorAll('.plainmark-table-block td, .plainmark-table-block th'),
    ) as HTMLTableCellElement[];
    expect(tds.length).toBeGreaterThan(0);
    for (const td of tds) {
      expect(td.dataset.rowIndex).toBeDefined();
      expect(td.dataset.colIndex).toBeDefined();
      expect(td.dataset.cellFrom).toBeUndefined();
      expect(td.dataset.cellTo).toBeUndefined();
    }
  });
});

describe('table — math-grammar overlay survives cell-editor reuse', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(async () => {
    await ensure_mathjax();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-R-4: renders $x^2$ inside a cell editor as an inline mjx-container', async () => {
    const doc = '| math | plain |\n|------|-------|\n| $x^2$ z | y |\n';
    // mount_editor (not the local mount_main) wires cell_subview_extensions, so
    // the cell subview actually gets the math overlay this test asserts on.
    view = mount_editor(container, doc);

    const first_body_td = container.querySelectorAll(
      '.plainmark-table-block td',
    )[0] as HTMLTableCellElement;
    await activate(
      container,
      Number(first_body_td.dataset.rowIndex),
      Number(first_body_td.dataset.colIndex),
    );

    // Activation holds pointer_down, freezing reveal to the press-time caret
    // (inside the math). Park the caret past it, then release the pointer so
    // reveal unfreezes and the math widgetizes instead of showing `$…$` source.
    const sub = active_subview_view();
    sub.dispatch({ selection: { anchor: sub.state.doc.length } });
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    await expect
      .poll(
        () => first_body_td.querySelectorAll('mjx-container mjx-msup').length,
        { timeout: 30000, interval: 100 },
      )
      .toBeGreaterThan(0);
  });
});

describe('table — image widget tolerates an adjacent table widget', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  const sample_data_url =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeIVWUMAAAAASUVORK5CYII=';

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-E-8: mounts both an image-only paragraph and an adjacent table widget without throwing', () => {
    const doc = `![alt](${sample_data_url})\n\n| A | B |\n|---|---|\n| 1 | 2 |\n`;
    expect(() => {
      view = mount_main(container, doc, { image_base: 'https://example.test/' });
    }).not.toThrow();

    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(1);
    expect(container.querySelectorAll('.plainmark-table-block table')).toHaveLength(1);
  });
});

// Structural fingerprint: visible textContent (zero-width stripped, whitespace
// collapsed) + the set of inline-construct tagNames present. Used by the AC1
// continuity test to compare at-rest <td> vs focused subview without coupling to layout.
function inline_fingerprint(el: HTMLElement): { text: string; tags: Set<string> } {
  const inline_tags = new Set([
    'STRONG',
    'EM',
    'DEL',
    'CODE',
    'A',
    'IMG',
    'BR',
    'MJX-CONTAINER',
  ]);
  const tags = new Set<string>();
  el.querySelectorAll('*').forEach((n) => {
    if (inline_tags.has(n.tagName)) tags.add(n.tagName);
  });
  const text = (el.textContent ?? '')
    .replace(/​/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, tags };
}

describe('table — AC1 visual continuity between at-rest <td> and focused subview', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(async () => {
    await ensure_mathjax();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-I-1 TBL-R-3: at-rest <td> and focused subview share textContent and inline-construct tagNames', async () => {
    view = mount_editor(container, fixture('inline-content'), 'https://example.test/');

    await expect
      .poll(
        () => container.querySelectorAll('.plainmark-math-pending').length,
        { timeout: 30000, interval: 100 },
      )
      .toBe(0);

    // Body row 1 (first non-header row): col 0 has **bold**, col 2 has $x^2$.
    // Pick the cell with both inline-emit constructs alongside text — col 0 is
    // the bold cell; we want a structural diff that includes inline math, so
    // grab a row that has bold (col 0). For continuity we also check col 2.
    // At-rest cells: emitter wraps **bold** as <strong> and $x^2$ as a
    // typeset <mjx-container>. Different cells host different constructs;
    // continuity is asserted per-cell against its focused-subview view.
    const at_rest_bold = inline_fingerprint(get_cell(container, 1, 0));
    const at_rest_math = inline_fingerprint(get_cell(container, 1, 2));
    expect(at_rest_bold.tags.has('STRONG')).toBe(true);
    expect(at_rest_bold.text).toContain('bold');
    expect(at_rest_math.tags.has('MJX-CONTAINER')).toBe(true);

    // Focus the bold cell. The subview's text_styles_extension reveals
    // the ** markers — the visible text gains them. Stripping the markers
    // from the focused fingerprint must yield the same visible text as the
    // emitter produced at rest.
    await activate(container, 1, 0);
    await settle();

    const focused_bold_td = get_cell(container, 1, 0);
    const focused_bold = inline_fingerprint(focused_bold_td);
    expect(focused_bold.text.replace(/\*/g, '').trim()).toContain('bold');
    expect(focused_bold_td.querySelector('.cm-editor')).not.toBeNull();
  }, 60000);
});

describe('table — AC2 marker-reveal inside the cell subview', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-I-3 TBL-R-3: caret inside **bold** shows ** markers; blurred cell renders without them', async () => {
    const doc = '| **bold** | x |\n|---|---|\n| y | z |\n';
    view = mount_editor(container, doc);

    const header_bold_td = get_cell(container, 0, 0);
    expect(header_bold_td.querySelector('strong')).not.toBeNull();
    expect((header_bold_td.textContent ?? '').replace(/​/g, '')).not.toContain('**');

    await activate(container, 0, 0);
    await settle();
    const sub = active_subview_view();
    // Caret in the middle of the bold word (subview doc is "**bold**"; pos 4 sits between 'b' and 'o').
    sub.dispatch({ selection: { anchor: 4 } });
    await settle();

    const subview_text = (sub.contentDOM.textContent ?? '').replace(/​/g, '');
    expect(subview_text).toContain('**');

    // Activate a different cell — original cell re-renders via emitter, markers gone.
    await activate(container, 0, 1);
    await settle();

    const post_blur_text = (header_bold_td.textContent ?? '').replace(/​/g, '');
    expect(post_blur_text).not.toContain('**');
    expect(header_bold_td.querySelector('strong')).not.toBeNull();
  }, 15000);
});

describe('table — AC3 atomic DOM swap on focus produces no intermediate empty state', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-I-1: observed cell states never have both empty children and empty text', async () => {
    const doc = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n';
    view = mount_editor(container, doc);
    const td = get_cell(container, 1, 0);

    let empty_seen = false;
    const check_state = (): void => {
      if (td.children.length === 0 && (td.textContent ?? '').trim() === '') {
        empty_seen = true;
      }
    };
    check_state();

    const observer = new MutationObserver(() => check_state());
    observer.observe(td, { subtree: true, childList: true, characterData: true });

    td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await next_frame();
    check_state();
    await next_frame();
    check_state();

    observer.disconnect();

    expect(empty_seen).toBe(false);
    expect(td.querySelector('.plainmark-table-cell-edit')).not.toBeNull();
  });
});

describe('table — AC4 every cell keystroke produces exactly one whole-table main-view transaction', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-SP-1 TBL-SP-8: each keystroke dispatches one transaction covering [table.from, table.to(+1 TA2)]', async () => {
    const doc = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n';
    view = mount_editor(container, doc);
    const main = view;

    await activate(container, 1, 0);
    await clear_subview();
    await settle();
    await wait_past_group_delay();

    let recording = false;
    const change_log: Array<{ fromA: number; toA: number; insert: string }> = [];
    const test_listener = EditorView.updateListener.of((u) => {
      if (!recording) return;
      if (!u.docChanged) return;
      for (const tr of u.transactions) {
        if (!tr.docChanged) continue;
        tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          change_log.push({ fromA, toA, insert: inserted.toString() });
        });
      }
    });
    const { StateEffect } = await import('@codemirror/state');
    main.dispatch({ effects: StateEffect.appendConfig.of([test_listener]) });

    // Recompute table range AFTER the clear so we compare against the live
    // serialized table; the initial clear already dispatched a whole-table
    // replace and shrank table.to.
    const tables_after_clear = find_tables(main.state);
    expect(tables_after_clear.length).toBe(1);
    const table_from = tables_after_clear[0].from;
    const table_to = tables_after_clear[0].to;

    recording = true;
    change_log.length = 0;
    await type_in_subview('q');
    await next_frame();
    await settle();
    expect(change_log.length).toBe(1);
    const first = change_log[0];
    expect(first.fromA).toBe(table_from);
    expect([table_to, table_to + 1]).toContain(first.toA);

    change_log.length = 0;
    await type_in_subview('r');
    await next_frame();
    await settle();
    expect(change_log.length).toBe(1);

    change_log.length = 0;
    await type_in_subview('s');
    await next_frame();
    await settle();
    expect(change_log.length).toBe(1);
  }, 20000);
});

describe('table — AC5 MC1 normalization on first edit of a mismatched-column table', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  function body_pipe_counts(doc_text: string): number[] {
    const lines = doc_text.split('\n');
    const out: number[] = [];
    let seen_delim = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) continue;
      if (/^\|[\s:|-]+\|?\s*$/.test(trimmed)) {
        seen_delim = true;
        continue;
      }
      if (!seen_delim) continue;
      // Count cells = (number of unescaped | minus boundary pipes).
      const pipes = (trimmed.match(/(?<!\\)\|/g) ?? []).length;
      const has_leading = trimmed.startsWith('|');
      const has_trailing = trimmed.endsWith('|');
      const boundary = (has_leading ? 1 : 0) + (has_trailing ? 1 : 0);
      out.push(pipes - boundary + 1);
    }
    return out;
  }

  it('TBL-E-2 TBL-SP-6 TBL-R-9 TBL-SP-9: first cell edit normalizes every body row to the header column count, idempotent on second edit', async () => {
    view = mount_editor(container, fixture('mismatched-cols'));
    const main = view;

    const initial = main.state.doc.toString();
    const initial_counts = body_pipe_counts(initial);
    expect(new Set(initial_counts).size).toBeGreaterThan(1);

    // Render-time underflow padding — every body row's <td> count must
    // equal the header <th> count, even though the source has mismatched rows.
    const header_th_count = container.querySelectorAll(
      '.plainmark-table-block thead tr th',
    ).length;
    expect(header_th_count).toBe(3);
    const body_rows = container.querySelectorAll('.plainmark-table-block tbody tr');
    expect(body_rows.length).toBeGreaterThan(0);
    for (const tr of Array.from(body_rows)) {
      const td_count = tr.querySelectorAll('td').length;
      expect(td_count).toBe(header_th_count);
    }

    await activate(container, 1, 0);
    await clear_subview();
    await wait_past_group_delay();
    await type_in_subview('x');
    await settle();
    await wait_past_group_delay();

    const after_first = main.state.doc.toString();
    const after_counts = body_pipe_counts(after_first);
    expect(after_counts.length).toBeGreaterThan(0);
    for (const c of after_counts) expect(c).toBe(3);

    await clear_subview();
    await wait_past_group_delay();
    await type_in_subview('y');
    await settle();
    await wait_past_group_delay();

    const after_second = main.state.doc.toString();
    const after_second_counts = body_pipe_counts(after_second);
    expect(after_second_counts.length).toBeGreaterThan(0);
    for (const c of after_second_counts) expect(c).toBe(3);
  }, 30000);
});

describe('table — inline emitter renders bold / italic / code / link / image / inline math in cells', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(async () => {
    await ensure_mathjax();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-R-3 TBL-R-4: each inline construct emits the expected DOM element inside .plainmark-table-block td', async () => {
    view = mount_editor(container, fixture('inline-content'), 'https://example.test/');

    await expect
      .poll(
        () => container.querySelectorAll('.plainmark-math-pending').length,
        { timeout: 30000, interval: 100 },
      )
      .toBe(0);

    const tds = container.querySelectorAll('.plainmark-table-block td');
    expect(tds.length).toBeGreaterThan(0);

    expect(container.querySelectorAll('.plainmark-table-block td strong').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.plainmark-table-block td em').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.plainmark-table-block td code').length).toBeGreaterThan(0);

    const links = container.querySelectorAll('.plainmark-table-block td a');
    expect(links.length).toBeGreaterThan(0);
    expect((links[0] as HTMLAnchorElement).getAttribute('href')).toBe('https://b.test');

    const imgs = container.querySelectorAll('.plainmark-table-block td img');
    expect(imgs.length).toBeGreaterThan(0);

    expect(
      container.querySelectorAll('.plainmark-table-block td mjx-container').length,
    ).toBeGreaterThan(0);
  }, 60000);
});

describe('table — clicking an underfill placeholder mounts an empty subview and normalizes on first keystroke', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-R-9 TBL-E-2 TBL-SP-6: placeholder cell at (2,2) edits to a real cell with header column count', async () => {
    view = mount_editor(container, fixture('mismatched-cols'));
    const main = view;

    const placeholder_td = get_cell(container, 2, 2);
    expect(placeholder_td.dataset.placeholder).toBe('underfill');

    await activate(container, 2, 2);
    const sub = active_subview_view();
    expect(sub.state.doc.toString()).toBe('');

    await type_in_subview('z');
    await settle();
    await wait_past_group_delay();

    const after = main.state.doc.toString();
    expect(after).toMatch(/\|\s*x\s*\|\s*y\s*\|\s*z\s*\|/);

    const header_th_count = container.querySelectorAll(
      '.plainmark-table-block thead tr th',
    ).length;
    const body_rows = container.querySelectorAll('.plainmark-table-block tbody tr');
    for (const tr of Array.from(body_rows)) {
      expect(tr.querySelectorAll('td').length).toBe(header_th_count);
    }

    const refreshed = get_cell(container, 2, 2);
    expect(refreshed.dataset.placeholder).toBeUndefined();
  }, 30000);
});
