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
  return (dom?.textContent ?? '').replace(/​/g, '');
}
