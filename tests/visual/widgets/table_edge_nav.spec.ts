import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { table_completions } from '../../../src/webview/widgets/table_autocomplete.js';

const STARTER = [
  '|     |     |     |',
  '| --- | --- | --- |',
  '|     |     |     |',
  '|     |     |     |',
].join('\n');

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function settle(): Promise<void> {
  // teardown rides setTimeout(0); allow a macrotask drain + one frame.
  await new Promise((r) => setTimeout(r, 20));
  await next_frame();
}

function get_table_block(container: HTMLElement): HTMLElement {
  const block = container.querySelector('.plainmark-table-block') as HTMLElement | null;
  if (!block) throw new Error('no .plainmark-table-block in DOM');
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
  if (!sub) throw new Error('no active subview container');
  const root = sub.querySelector('.cm-editor') as HTMLElement | null;
  if (!root) throw new Error('no .cm-editor inside subview');
  const sub_view = EditorView.findFromDOM(root);
  if (!sub_view) throw new Error('EditorView.findFromDOM returned null for subview root');
  return sub_view;
}

function subview_content_dom(): HTMLElement {
  const cm = active_subview_container()?.querySelector('.cm-content') as HTMLElement | null;
  if (!cm) throw new Error('no .cm-content in active subview');
  return cm;
}

async function activate_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): Promise<HTMLElement> {
  const td = get_cell(container, row_index, col_index);
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await next_frame();
  await next_frame();
  const sub = active_subview_container();
  if (!sub) throw new Error('subview did not mount');
  return sub;
}

function key(target: Element, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

function fire_accept(view: EditorView): void {
  const ctx = {
    state: view.state,
    pos: view.state.selection.main.head,
    explicit: true,
    view,
    aborted: false,
    addEventListener: () => {},
    tokenBefore: () => null,
    matchBefore: () => null,
  } as unknown as Parameters<typeof table_completions>[0];
  const result = table_completions(ctx);
  if (!result) throw new Error('table_completions returned null');
  const option = result.options[0];
  const apply = option.apply;
  if (typeof apply !== 'function') throw new Error('completion has no apply()');
  if (typeof result.to !== 'number') throw new Error('completion result missing to');
  apply(view, option, result.from, result.to);
}

describe('table edge navigation — keymap-driven adjacency injection', () => {
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

  it('TableEdgeBufferWidget DOM is gone: no .plainmark-table-edge-buffer element after mount', async () => {
    view = mount_editor(container, STARTER);
    await next_frame();
    // The adjacency-injection rework deleted the TableEdgeBufferWidget — regression guard.
    expect(container.querySelector('.plainmark-table-edge-buffer')).toBeNull();
  });

  it('TBL-I-20 TBL-SP-12: ArrowUp from header of an at-offset-0 table injects a leading \\n and lands caret at 0 (Fix 4)', async () => {
    view = mount_editor(container, STARTER);
    await activate_cell(container, 0, 0);

    key(subview_content_dom(), { key: 'ArrowUp' });
    await settle();

    expect(view.state.doc.sliceString(0, 1)).toBe('\n');
    expect(view.state.doc.toString()).toBe('\n' + STARTER);
    expect(view.state.selection.main.head).toBe(0);
    expect(active_subview_container()).toBeNull();
    const main = view.contentDOM;
    expect(main.contains(document.activeElement) || document.activeElement === main).toBe(true);
  });

  it('TBL-I-20 TBL-SP-12: ArrowUp from header of a NOT-at-offset-0 table uses exit_to_main_view (no byte injection)', async () => {
    const prefix = 'hello\n';
    view = mount_editor(container, prefix + STARTER);
    const before_doc = view.state.doc.toString();
    await activate_cell(container, 0, 0);

    key(subview_content_dom(), { key: 'ArrowUp' });
    await settle();

    expect(view.state.doc.toString()).toBe(before_doc);
    // exit_to_main_view(table_from - 1) → lands at position 5 (the '\n' between 'hello' and the table).
    expect(view.state.selection.main.head).toBe(prefix.length - 1);
    expect(active_subview_container()).toBeNull();
  });

  it('TBL-I-20 TBL-SP-12: Shift+Tab from first-cell-first-row of at-offset-0 table injects a leading \\n', async () => {
    view = mount_editor(container, STARTER);
    await activate_cell(container, 0, 0);

    key(subview_content_dom(), { key: 'Tab', shiftKey: true });
    await settle();

    expect(view.state.doc.toString()).toBe('\n' + STARTER);
    expect(view.state.selection.main.head).toBe(0);
    expect(active_subview_container()).toBeNull();
  });

  it('TBL-I-20 TBL-SP-12: ArrowLeft from first-cell-first-row of at-offset-0 table (subview cursor at 0) injects a leading \\n', async () => {
    view = mount_editor(container, STARTER);
    await activate_cell(container, 0, 0);
    // ArrowLeft only fires the boundary-exit branch when the subview's caret is
    // at the start of the cell content. Make that explicit.
    const sub_view = active_subview_view();
    sub_view.dispatch({ selection: { anchor: 0 } });

    key(subview_content_dom(), { key: 'ArrowLeft' });
    await settle();

    expect(view.state.doc.toString()).toBe('\n' + STARTER);
    expect(view.state.selection.main.head).toBe(0);
    expect(active_subview_container()).toBeNull();
  });

  it('TBL-I-21 TBL-SP-12: ArrowDown from last row of an at-end-of-doc table injects a trailing \\n and lands caret at doc end (Fix 3)', async () => {
    view = mount_editor(container, STARTER);
    const len_before = view.state.doc.length;
    // Last visible row in the rendered table is index 2 (header + 2 body rows).
    await activate_cell(container, 2, 0);

    key(subview_content_dom(), { key: 'ArrowDown' });
    await settle();

    const doc = view.state.doc.toString();
    expect(doc.endsWith('\n')).toBe(true);
    expect(view.state.doc.length).toBe(len_before + 1);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(active_subview_container()).toBeNull();
  });

  it('TBL-I-6 TBL-I-21 TBL-SP-12: Enter from last row of an at-end-of-doc table injects a trailing \\n and lands caret at doc end', async () => {
    view = mount_editor(container, STARTER);
    const len_before = view.state.doc.length;
    await activate_cell(container, 2, 0);

    key(subview_content_dom(), { key: 'Enter' });
    await settle();

    const doc = view.state.doc.toString();
    expect(doc.endsWith('\n')).toBe(true);
    expect(view.state.doc.length).toBe(len_before + 1);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(active_subview_container()).toBeNull();
  });

  it('TBL-I-21 TBL-SP-12: ArrowDown from last row of a NOT-at-end-of-doc table exits to start of line after the table (no byte injection)', async () => {
    // '\n\n' separator forces lezer to terminate the Table node at STARTER.length;
    // without it the parser absorbs the trailing paragraph into the table.
    const suffix = '\n\nhello';
    view = mount_editor(container, STARTER + suffix);
    const before_doc = view.state.doc.toString();
    await activate_cell(container, 2, 0);

    key(subview_content_dom(), { key: 'ArrowDown' });
    await settle();

    expect(view.state.doc.toString()).toBe(before_doc);
    // Bug 2 fix: exit target is the start of the line strictly after
    // info.to, not info.to itself (which sits mid-line inside the block-replace's
    // visual extent and rendered as the giant widget-right-bottom fallback).
    expect(view.state.selection.main.head).toBe(STARTER.length + 1);
    expect(active_subview_container()).toBeNull();
  });

  it('TBL-I-20: after Fix-4 leading-\\n injection the caret position renders with valid coords (visible-cursor structural check)', async () => {
    view = mount_editor(container, STARTER);
    await activate_cell(container, 0, 0);

    key(subview_content_dom(), { key: 'ArrowUp' });
    await settle();

    // Structural verification of the user-reported symptom: was the caret
    // actually placed in a visibly-renderable spot? `coordsAtPos(0)` returns
    // null when the position is unreachable (e.g. inside a block-replace).
    expect(view.state.selection.main.head).toBe(0);
    const coords = view.coordsAtPos(0);
    expect(coords).not.toBeNull();
    expect(Number.isFinite(coords!.top)).toBe(true);
    expect(Number.isFinite(coords!.left)).toBe(true);
  });

  it('table at last line: trailing-\\n line is caret-reachable via dispatch (B1 byte still in place)', async () => {
    view = mount_editor(container, STARTER + '\n');
    const doc_len = view.state.doc.length;
    expect(() => view!.dispatch({ selection: { anchor: doc_len } })).not.toThrow();
    expect(view.state.selection.main.head).toBe(doc_len);
  });

  it('EB autocomplete on empty doc produces "\\n + STARTER + \\n" (Fix 5 + Fix B1)', async () => {
    view = mount_editor(container, '|');
    fire_accept(view);
    await next_frame();
    await next_frame();
    expect(view.state.doc.toString()).toBe('\n' + STARTER + '\n');
  });
});
