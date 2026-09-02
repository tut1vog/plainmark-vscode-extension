import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editor_extensions } from '../../src/webview/editor_extensions.js';
import { set_image_base_effect } from '../../src/webview/widgets/image.js';

export function mount_editor(
  parent: HTMLElement,
  doc: string,
  image_base?: string,
): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [...editor_extensions],
      selection: { anchor: doc.length },
    }),
    parent,
  });
  if (image_base) {
    view.dispatch({ effects: set_image_base_effect.of(image_base) });
  }
  return view;
}

export function move_cursor(view: EditorView, anchor: number): void {
  view.dispatch({ selection: { anchor } });
}

export function get_line_text(view: EditorView, line_index: number): string {
  const dom = view.contentDOM.querySelectorAll('.cm-line')[line_index];
  return (dom?.textContent ?? '').replace(/\u200B/g, '');
}

export function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

export async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

export function get_table_block(container: HTMLElement): HTMLElement {
  const block = container.querySelector('.plainmark-table-block') as HTMLElement | null;
  if (!block) throw new Error('no .plainmark-table-block');
  return block;
}

export function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const td = get_table_block(container).querySelector(
    `[data-row-index="${row_index}"][data-col-index="${col_index}"]`,
  ) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}
