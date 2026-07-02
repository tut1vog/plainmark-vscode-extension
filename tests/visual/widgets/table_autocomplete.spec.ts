import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startCompletion } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { table_completions } from '../../../src/webview/widgets/table_autocomplete.js';

function get_table_block(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.plainmark-table-block') as HTMLElement | null;
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const sel = `[data-row-index="${row_index}"][data-col-index="${col_index}"]`;
  const block = get_table_block(container);
  if (!block) throw new Error('no .plainmark-table-block');
  const td = block.querySelector(sel) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function wait_for_tooltip(timeout_ms = 500): Promise<HTMLElement | null> {
  const deadline = performance.now() + timeout_ms;
  while (performance.now() < deadline) {
    const tip = document.querySelector('.cm-tooltip-autocomplete') as HTMLElement | null;
    if (tip) return tip;
    await next_frame();
  }
  return null;
}

function tooltip_label_texts(tip: HTMLElement): string[] {
  return Array.from(tip.querySelectorAll('.cm-completionLabel')).map(
    (n) => (n.textContent ?? '').trim(),
  );
}

function type_pipe(view: EditorView): void {
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: '|' },
    selection: { anchor: pos + 1 },
    userEvent: 'input.type',
  });
}

// Invoke the completion's apply callback directly. acceptCompletion has an
// interactionDelay-gated path that's flaky from synthetic-event harnesses; the
// apply callback is the production behavior we actually want to assert.
function fire_accept(view: EditorView): void {
  const ctx = {
    state: view.state,
    pos: view.state.selection.main.head,
    explicit: true,
    view,
    // Below are CompletionContext properties our source function doesn't use.
    aborted: false,
    addEventListener: () => {},
    tokenBefore: () => null,
    matchBefore: () => null,
  } as unknown as Parameters<typeof table_completions>[0];
  const result = table_completions(ctx);
  if (!result) throw new Error('table_completions returned null in fire_accept');
  const option = result.options[0];
  const apply = option.apply;
  if (typeof apply !== 'function') throw new Error('completion has no apply()');
  if (typeof result.to !== 'number') throw new Error('completion result missing to');
  apply(view, option, result.from, result.to);
}

const SAMPLE_TABLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n';

describe('table autocomplete — EB completion gating', () => {
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
    document.querySelectorAll('.cm-tooltip-autocomplete').forEach((el) => el.remove());
  });

  it('TBL-I-16: shows the "Insert table (3×3)" completion when `|` is typed on an empty line', async () => {
    view = mount_editor(container, '');
    type_pipe(view);
    startCompletion(view);
    const tip = await wait_for_tooltip();
    expect(tip).not.toBeNull();
    expect(tooltip_label_texts(tip!)).toContain('Insert table (3×3)');
  });

  it('TBL-I-16: does not show the completion when `|` is typed mid-line', async () => {
    view = mount_editor(container, 'hello');
    type_pipe(view);
    startCompletion(view);
    // Give the autocomplete plugin a chance to react.
    await next_frame();
    await next_frame();
    const tip = document.querySelector('.cm-tooltip-autocomplete') as HTMLElement | null;
    if (tip) {
      expect(tooltip_label_texts(tip)).not.toContain('Insert table (3×3)');
    } else {
      expect(tip).toBeNull();
    }
  });

  it('TBL-I-16: does not show the completion when typing `|` inside a focused cell subview', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const td = get_cell(container, 1, 0);
    td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await next_frame();
    await next_frame();
    const subview = document.querySelector('.plainmark-table-cell-edit');
    expect(subview).not.toBeNull();
    // Type a pipe into the subview directly; the outer view is what owns the
    // table_autocomplete_extension, so a cell-local insert must not trigger it.
    const cm = subview!.querySelector('.cm-content') as HTMLElement | null;
    expect(cm).not.toBeNull();
    cm!.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: '|' }),
    );
    await next_frame();
    const tip = document.querySelector('.cm-tooltip-autocomplete') as HTMLElement | null;
    if (tip) {
      expect(tooltip_label_texts(tip)).not.toContain('Insert table (3×3)');
    } else {
      expect(tip).toBeNull();
    }
  });
});

describe('autocomplete tooltip theming THEME-V-11', () => {
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
    document.querySelectorAll('.cm-tooltip-autocomplete').forEach((el) => el.remove());
    for (const name of [
      '--plainmark-autocomplete-background',
      '--plainmark-autocomplete-selected-background',
      '--plainmark-autocomplete-selected-foreground',
      '--plainmark-autocomplete-scrollbar-thumb-color',
    ]) {
      document.documentElement.style.removeProperty(name);
    }
  });

  it('THEME-V-11: tooltip panel and selected row consume the --plainmark-autocomplete-* variables', async () => {
    const root = document.documentElement;
    root.style.setProperty('--plainmark-autocomplete-background', 'rgb(1, 2, 3)');
    root.style.setProperty('--plainmark-autocomplete-selected-background', 'rgb(4, 5, 6)');
    root.style.setProperty('--plainmark-autocomplete-selected-foreground', 'rgb(7, 8, 9)');

    view = mount_editor(container, '');
    type_pipe(view);
    startCompletion(view);
    const tip = await wait_for_tooltip();
    expect(tip).not.toBeNull();
    expect(getComputedStyle(tip!).backgroundColor).toBe('rgb(1, 2, 3)');

    const selected = tip!.querySelector('li[aria-selected]') as HTMLElement | null;
    expect(selected).not.toBeNull();
    expect(getComputedStyle(selected!).backgroundColor).toBe('rgb(4, 5, 6)');
    expect(getComputedStyle(selected!).color).toBe('rgb(7, 8, 9)');
  });

  it('THEME-V-11: list scrollbar re-overrides the webview-inherited scrollbar-color at the element', async () => {
    // VS Code webviews inject `html { scrollbar-color: … }`, which disables the
    // ::-webkit-scrollbar-* path entirely (Chrome 121+) — the themed value must
    // therefore land on the standard property at the scrolling element itself.
    document.documentElement.style.setProperty('scrollbar-color', 'rgb(9, 9, 9) rgb(8, 8, 8)');
    document.documentElement.style.setProperty(
      '--plainmark-autocomplete-scrollbar-thumb-color',
      'rgb(10, 20, 30)',
    );
    try {
      view = mount_editor(container, '');
      type_pipe(view);
      startCompletion(view);
      const tip = await wait_for_tooltip();
      expect(tip).not.toBeNull();
      const ul = tip!.querySelector('ul') as HTMLElement;
      expect(getComputedStyle(ul).scrollbarColor).toBe('rgb(10, 20, 30) rgba(0, 0, 0, 0)');
    } finally {
      document.documentElement.style.removeProperty('scrollbar-color');
    }
  });
});

describe('table autocomplete — accept path', () => {
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
    document.querySelectorAll('.cm-tooltip-autocomplete').forEach((el) => el.remove());
  });

  it('TBL-I-16: accept replaces the `|` line with a 4-line starter table', async () => {
    view = mount_editor(container, '|');
    fire_accept(view);
    await next_frame();
    await next_frame();

    // Fix 5: from === 0 prepends a leading \n. TA2 appends trailing \n.
    expect(view.state.doc.toString()).toBe(
      '\n' +
        [
          '|     |     |     |',
          '| --- | --- | --- |',
          '|     |     |     |',
          '|     |     |     |',
          '',
        ].join('\n'),
    );

    const block = get_table_block(container);
    expect(block).not.toBeNull();
    const tbody_rows = block!.querySelectorAll('tbody tr');
    const thead_rows = block!.querySelectorAll('thead tr');
    expect(thead_rows.length).toBe(1);
    // Two source body rows under the header; renderer mirrors that.
    expect(tbody_rows.length).toBeGreaterThanOrEqual(2);
    // 3 columns in the header row.
    expect(thead_rows[0].querySelectorAll('th, td').length).toBe(3);
  });

  it('TBL-I-16: accept focuses the first header cell (row 0, col 0)', async () => {
    view = mount_editor(container, '|');
    fire_accept(view);
    // request_cell_focus rides a requestMeasure → activate_cell → defer; a few
    // frames are needed before the subview owns the active element.
    await next_frame();
    await next_frame();
    await next_frame();
    await next_frame();

    const cell00 = get_cell(container, 0, 0);
    const active = document.activeElement;
    expect(active).not.toBeNull();
    expect(cell00.contains(active)).toBe(true);
  });

  it('TBL-I-16: accept fires exactly one main-view dispatch tagged userEvent input', async () => {
    view = mount_editor(container, '|');
    const dispatch_spy = vi.spyOn(view, 'dispatch');
    fire_accept(view);
    await next_frame();

    // The apply callback produces exactly one change-bearing main-view dispatch;
    // the re-focus activation adds a selection-only seed (RC3) that must not be
    // counted (request_cell_focus itself uses requestMeasure, no dispatch).
    const change_calls = dispatch_spy.mock.calls.filter(
      (c) => (c[0] as { changes?: unknown }).changes !== undefined,
    );
    expect(change_calls.length).toBe(1);
    const arg = change_calls[0][0] as {
      annotations?: { value?: string }[] | { value?: string };
    };
    const ann = Array.isArray(arg.annotations) ? arg.annotations : [arg.annotations];
    const has_input_user_event = ann.some(
      (a) => typeof a === 'object' && a !== null && 'value' in a && (a as { value?: string }).value === 'input',
    );
    expect(has_input_user_event).toBe(true);
  });

  it('TBL-I-16 TBL-SP-7: TA2: no trailing newline injected when a `\\n` already follows the insertion', async () => {
    view = mount_editor(container, '|\nhello');
    // Place caret right after the `|`, before the newline, so table_completions
    // matches the `|` line.
    view.dispatch({ selection: { anchor: 1 } });
    fire_accept(view);
    await next_frame();

    const doc = view.state.doc.toString();
    const starter = [
      '|     |     |     |',
      '| --- | --- | --- |',
      '|     |     |     |',
      '|     |     |     |',
    ].join('\n');
    // The completion's `from`..`to` covers the `|` line (positions 0..1).
    // Fix 5 prepends a leading `\n` because from === 0. The next byte at
    // `to` is `\n` (from the original `\nhello`), so TA2 does NOT inject an
    // extra trailing `\n` — single `\n` between table and `hello`.
    expect(doc).toBe('\n' + starter + '\nhello');
  });
});
