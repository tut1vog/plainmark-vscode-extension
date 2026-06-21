import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Extension, StateField } from '@codemirror/state';
import {
  EditorView,
  type Rect,
  showTooltip,
  type Tooltip,
  type TooltipView,
  type ViewUpdate,
} from '@codemirror/view';
import { should_reveal_for_selection } from '../decorations/selection_reveal.js';
import { ensure_chtml_stylesheet, find_inline_math_source } from './math.js';
import { load_mathjax, mathjax_loadable } from './mathjax_loader.js';
import { create_logger } from '../../log.js';

const log = create_logger('widget');

const DEBOUNCE_MS = 120;

export interface MathContext {
  display: boolean;
  from: number;
  to: number;
  src: string;
}

export function find_math_context_at(state: EditorState): MathContext | null {
  const sel = state.selection.main;
  let found: MathContext | null = null;
  syntaxTree(state).iterate({
    from: sel.from,
    to: sel.to,
    enter(node) {
      if (found) return false;
      if (node.name === 'InlineMath') {
        const { from, to } = node;
        // Gate the preview on the same reveal predicate as the widget so it shows only when the raw `$…$` is revealed (e.g. not on a strict-covering select-all).
        if (should_reveal_for_selection(state, from, to)) {
          found = {
            display: false,
            from,
            to,
            src: find_inline_math_source(state, from, to),
          };
        }
      }
      return;
    },
  });
  return found;
}

function context_key(ctx: MathContext): string {
  return `inline:${ctx.from}`;
}

interface PreviewState {
  tooltips: readonly Tooltip[];
  key: string | null;
}

function build_tooltip(ctx: MathContext): Tooltip {
  return {
    pos: ctx.from,
    above: false,
    // Never flip above: a long `$…$` that wraps must keep its preview below the
    // caret's screen line, never on top of the line being edited.
    strictSide: true,
    arrow: false,
    create: (view) => make_preview_view(view),
  };
}

function compute_state(state: EditorState, prev: PreviewState): PreviewState {
  const ctx = find_math_context_at(state);
  if (!ctx) return prev.key === null ? prev : { tooltips: [], key: null };
  const key = context_key(ctx);
  // Same construct: reuse the existing Tooltip object. CM6 keys TooltipView
  // reuse on the `create` function's identity, so the view (and its debounce
  // timer) survives without teardown/flicker. Returning a fresh array reference
  // makes the tooltip plugin re-measure, so getCoords re-anchors the popover
  // below the caret's current screen line as the caret moves within the span.
  if (key === prev.key) return { tooltips: prev.tooltips.slice(), key };
  return { tooltips: [build_tooltip(ctx)], key };
}

const math_preview_field = StateField.define<PreviewState>({
  create: (state) => compute_state(state, { tooltips: [], key: null }),
  update: (value, tr) => {
    if (!tr.docChanged && !tr.selection) return value;
    return compute_state(tr.state, value);
  },
  provide: (f) => showTooltip.computeN([f], (s) => s.field(f).tooltips),
});

function make_preview_view(view: EditorView): TooltipView {
  const dom = document.createElement('div');
  dom.className = 'plainmark-math-preview';

  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let destroyed = false;

  const render = (ctx: MathContext): void => {
    const mathjax = window.MathJax;
    if (!mathjax?.tex2chtmlPromise) {
      // bundle may still be lazily loading — render once it lands
      if (mathjax_loadable()) {
        load_mathjax()
          .then(() => {
            if (!destroyed) render(ctx);
          })
          .catch(() => undefined);
      }
      return;
    }
    const gen = ++generation;
    log.debug('math preview typeset', {
      display: ctx.display,
      src_len: ctx.src.length,
    });
    mathjax
      .tex2chtmlPromise(ctx.src, { display: ctx.display })
      .then((node) => {
        if (destroyed || gen !== generation) return;
        ensure_chtml_stylesheet();
        const error_el = node.querySelector('mjx-merror');
        if (error_el) {
          const message =
            error_el.getAttribute('data-mjx-error') ??
            error_el.textContent ??
            'invalid TeX';
          const alert = document.createElement('div');
          alert.className = 'plainmark-math-preview-error';
          alert.textContent = `TeX error: ${message}`;
          dom.replaceChildren(alert);
          return;
        }
        dom.replaceChildren(node);
      })
      .catch((err: unknown) => {
        log.warn('math preview typeset failed', {
          display: ctx.display,
          src_len: ctx.src.length,
          err,
        });
      });
  };

  const initial = find_math_context_at(view.state);
  if (initial) render(initial);

  return {
    dom,
    // Anchor below the span's last (closing-`$`) screen line, horizontally at
    // the span start, so the popover clears the whole revealed `$…$` source no
    // matter which wrapped line the caret is on — never on top of the equation
    // or the caret. CM6 re-runs this each measure pass.
    getCoords: (pos: number): Rect => {
      const ctx = find_math_context_at(view.state);
      const start = view.coordsAtPos(pos);
      const end = ctx ? view.coordsAtPos(ctx.to) : null;
      if (!end) return start ?? { left: 0, right: 0, top: 0, bottom: 0 };
      if (!start) return end;
      return { left: start.left, right: start.left, top: end.top, bottom: end.bottom };
    },
    update(update: ViewUpdate): void {
      if (!update.docChanged && !update.selectionSet) return;
      const ctx = find_math_context_at(update.state);
      if (!ctx) return;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        render(ctx);
      }, DEBOUNCE_MS);
    },
    destroy(): void {
      destroyed = true;
      if (timer != null) clearTimeout(timer);
    },
  };
}

const math_preview_theme = EditorView.theme({
  '.plainmark-math-preview': {
    backgroundColor:
      'var(--plainmark-popover-background, var(--vscode-editorHoverWidget-background, var(--vscode-editor-background)))',
    border:
      '1px solid var(--plainmark-popover-border-color, var(--vscode-editorHoverWidget-border, currentColor))',
    padding: '0.25em 0.5em',
    borderRadius: '3px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    fontSize: 'var(--plainmark-math-preview-size, 1.3em)',
  },
  '.plainmark-math-preview-error': {
    color: 'var(--vscode-errorForeground, currentColor)',
  },
});

export const math_preview_extension: Extension[] = [
  math_preview_field,
  math_preview_theme,
];
