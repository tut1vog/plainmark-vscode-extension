import { type EditorView, WidgetType } from '@codemirror/view';

export interface PreviewRenderState<Good> {
  timer: ReturnType<typeof setTimeout> | null;
  generation: number;
  last_good: Good | null;
  destroyed: boolean;
}

const preview_render_states = new WeakMap<HTMLElement, PreviewRenderState<unknown>>();

// Debounced live-preview lifecycle shared by the math and mermaid block
// previews: one render state per container, a generation counter that drops
// stale async results, and a destroyed flag that stops in-flight work.
export abstract class BlockPreviewWidget<Good> extends WidgetType {
  protected abstract readonly class_name: string;
  protected abstract readonly debounce_ms: number;
  protected abstract render(dom: HTMLElement, state: PreviewRenderState<Good>, view: EditorView): void;

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className = this.class_name;
    container.style.minHeight = '1.5em';
    const state: PreviewRenderState<Good> = {
      timer: null,
      generation: 0,
      last_good: null,
      destroyed: false,
    };
    preview_render_states.set(container, state);
    this.schedule(container, state, view);
    return container;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = preview_render_states.get(dom) as PreviewRenderState<Good> | undefined;
    if (!state) return false;
    this.schedule(dom, state, view);
    return true;
  }

  destroy(dom: HTMLElement): void {
    const state = preview_render_states.get(dom);
    if (!state) return;
    if (state.timer != null) clearTimeout(state.timer);
    state.destroyed = true;
  }

  private schedule(dom: HTMLElement, state: PreviewRenderState<Good>, view: EditorView): void {
    if (state.timer != null) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = null;
      this.render(dom, state, view);
    }, this.debounce_ms);
  }
}

// The error presentation both previews share: the last good render dimmed
// under an alert, or the alert alone when nothing has rendered yet.
export function show_preview_error(
  dom: HTMLElement,
  last_good_html: string | null,
  message: string,
  base_class: string,
  view: EditorView,
): void {
  const alert = document.createElement('div');
  alert.className = `${base_class}-error`;
  alert.textContent = message;
  if (last_good_html) {
    const stale = document.createElement('div');
    stale.className = `${base_class}-stale`;
    stale.innerHTML = last_good_html;
    dom.replaceChildren(stale, alert);
  } else {
    dom.replaceChildren(alert);
  }
  view.requestMeasure();
}
