import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { table_completions } from '../../../src/webview/widgets/table_autocomplete.js';
import { table_widgets_field } from '../../../src/webview/widgets/table.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
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
  if (!result) throw new Error('table_completions returned null in fire_accept');
  const option = result.options[0];
  const apply = option.apply;
  if (typeof apply !== 'function') throw new Error('completion has no apply()');
  if (typeof result.to !== 'number') throw new Error('completion result missing to');
  apply(view, option, result.from, result.to);
}

function position_in_block_replace(view: EditorView, pos: number): { from: number; to: number } | null {
  const decos = view.state.field(table_widgets_field);
  let hit: { from: number; to: number } | null = null;
  decos.between(pos, pos + 1, (from, to) => {
    if (pos >= from && pos < to) {
      hit = { from, to };
      return false;
    }
  });
  return hit;
}

describe('Bug B: typing on the line after a freshly-inserted table', () => {
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

  it('TBL-R-7 TBL-SP-7: after EB autocomplete on empty doc, the line after the table is outside the block-replace decoration', async () => {
    view = mount_editor(container, '|');
    fire_accept(view);
    await next_frame();
    await next_frame();
    await next_frame();

    const doc_len = view.state.doc.length;
    const last_line = view.state.doc.lineAt(doc_len);

    // Pin the decoration range to support diagnosis if this fails.
    const decos = view.state.field(table_widgets_field);
    let table_from = -1;
    let table_to = -1;
    decos.between(0, doc_len, (from, to) => {
      table_from = from;
      table_to = to;
    });

    // Diagnostic snapshot (only printed when assertions fail).
    const diag = {
      doc: view.state.doc.toString(),
      doc_len,
      last_line_from: last_line.from,
      last_line_to: last_line.to,
      table_from,
      table_to,
    };

    // The line after the table — its starting position must NOT be inside the
    // block-replace. The TA2-injected trailing '\n' should leave a real,
    // caret-targetable line below the widget.
    const hit = position_in_block_replace(view, last_line.from);
    expect({ ...diag, hit }).toMatchObject({ hit: null });
  });

  it('typing on the line after a freshly-inserted table lands in the doc state', async () => {
    view = mount_editor(container, '|');
    fire_accept(view);
    await next_frame();
    await next_frame();
    await next_frame();

    const doc_len_before = view.state.doc.length;
    const last_line = view.state.doc.lineAt(doc_len_before);
    const insert_pos = last_line.from;

    // Move main-view selection to the line after the table. Direct dispatch —
    // bypasses focus/click semantics; isolates the doc-state question from the
    // event-delivery question.
    view.dispatch({ selection: { anchor: insert_pos } });

    // Type 'x' at that position.
    view.dispatch({
      changes: { from: insert_pos, to: insert_pos, insert: 'x' },
      selection: { anchor: insert_pos + 1 },
      userEvent: 'input.type',
    });
    await next_frame();
    await next_frame();

    expect(view.state.doc.length).toBe(doc_len_before + 1);
    expect(view.state.sliceDoc(insert_pos, insert_pos + 1)).toBe('x');
  });

  it('TBL-R-7: typing on the line after a freshly-inserted table renders the character in the DOM', async () => {
    view = mount_editor(container, '|');
    fire_accept(view);
    await next_frame();
    await next_frame();
    await next_frame();

    const last_line = view.state.doc.lineAt(view.state.doc.length);
    const insert_pos = last_line.from;

    view.dispatch({ selection: { anchor: insert_pos } });
    view.dispatch({
      changes: { from: insert_pos, to: insert_pos, insert: 'x' },
      selection: { anchor: insert_pos + 1 },
      userEvent: 'input.type',
    });
    await next_frame();
    await next_frame();

    // view.dom.textContent walks the rendered DOM. Block-replace widget content
    // is included (cell text is rendered HTML inside the widget); bytes hidden
    // by a block-replace and not surfaced as cell content are NOT included.
    // The typed 'x' sits on a regular markdown line; if it renders correctly,
    // textContent contains it. If it was absorbed into the widget's range, it's
    // invisible (no cell rendering claims it).
    expect(view.dom.textContent ?? '').toContain('x');

    // Stronger assertion: 'x' lives on its own `.cm-line` element (i.e., a real
    // rendered doc line below the widget).
    const lines = view.dom.querySelectorAll('.cm-line');
    const x_on_a_line = Array.from(lines).some(
      (line) => (line.textContent ?? '').includes('x'),
    );
    expect(x_on_a_line).toBe(true);
  });

  it('TBL-R-7: after typing on the line after the table, the typed character is OUTSIDE the rebuilt block-replace', async () => {
    view = mount_editor(container, '|');
    fire_accept(view);
    await next_frame();
    await next_frame();
    await next_frame();

    const last_line_before = view.state.doc.lineAt(view.state.doc.length);
    const insert_pos = last_line_before.from;

    view.dispatch({ selection: { anchor: insert_pos } });
    view.dispatch({
      changes: { from: insert_pos, to: insert_pos, insert: 'x' },
      selection: { anchor: insert_pos + 1 },
      userEvent: 'input.type',
    });
    await next_frame();
    await next_frame();

    // Pin the rebuilt decoration range and assert 'x' is not inside it.
    const decos = view.state.field(table_widgets_field);
    let rebuilt_table_to = -1;
    decos.between(0, view.state.doc.length, (_from, to) => {
      rebuilt_table_to = to;
    });

    const x_pos = insert_pos; // 'x' was inserted at insert_pos
    const hit = position_in_block_replace(view, x_pos);
    expect({
      doc: view.state.doc.toString(),
      doc_len: view.state.doc.length,
      x_pos,
      rebuilt_table_to,
      hit,
    }).toMatchObject({ hit: null });
  });
});
