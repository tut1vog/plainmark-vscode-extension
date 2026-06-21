import { syntaxTree } from '@codemirror/language';
import {
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  EditorView,
  showTooltip,
  type Tooltip,
  type TooltipView,
} from '@codemirror/view';
import { FOOTNOTE_REF_ATTR } from './footnote.js';
import {
  DEFINITION_HEAD_RE,
  DEFINITION_HEAD_STRIP_RE,
  FOOTNOTE_HEAD_SLICE,
  REFERENCE_EXACT_RE,
} from './footnote_parser.js';

const HOVER_DELAY_MS = 300;
const HOVER_CLOSE_DELAY_MS = 150;

type PopoverMode = 'hover' | 'click';

interface PopoverState {
  readonly label: string;
  readonly ref_from: number;
  readonly ref_to: number;
  readonly mode: PopoverMode;
}

const open_popover_effect = StateEffect.define<PopoverState>();
const close_popover_effect = StateEffect.define<{ mode?: PopoverMode } | undefined>();

const popover_state_field = StateField.define<PopoverState | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    for (const e of tr.effects) {
      if (e.is(open_popover_effect)) next = e.value;
      else if (e.is(close_popover_effect)) {
        const want_mode = e.value?.mode;
        if (!want_mode || next?.mode === want_mode) next = null;
      }
    }
    // Drop popover if the document changed under us (positions may be stale).
    if (tr.docChanged) return null;
    return next;
  },
});

function find_definition_range(
  state: EditorState_,
  label: string,
): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  syntaxTree(state).iterate({
    enter(node) {
      if (found) return false;
      if (node.name !== 'FootnoteDefinition') return;
      const head = state.doc.sliceString(
        node.from,
        Math.min(node.to, node.from + FOOTNOTE_HEAD_SLICE),
      );
      const m = DEFINITION_HEAD_RE.exec(head);
      if (m && m[1] === label) found = { from: node.from, to: node.to };
      return;
    },
  });
  return found;
}

// Local alias to keep import surface tight.
type EditorState_ = Parameters<typeof syntaxTree>[0];

function extract_definition_body(
  state: EditorState_,
  def_from: number,
  def_to: number,
): string {
  const text = state.doc.sliceString(def_from, def_to);
  const m = DEFINITION_HEAD_STRIP_RE.exec(text);
  return m ? text.slice(m[0].length) : text;
}

function make_popover_dom(
  state: PopoverState,
  view: EditorView,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'plainmark-footnote-popover';
  root.setAttribute('data-popover-mode', state.mode);

  const body = document.createElement('div');
  body.className = 'plainmark-footnote-popover-body';

  const def = find_definition_range(view.state, state.label);
  if (def) {
    body.textContent = extract_definition_body(view.state, def.from, def.to);
  } else {
    body.textContent = `No definition found for ^${state.label}`;
    body.classList.add('broken');
  }
  root.appendChild(body);

  if (state.mode === 'click') {
    const actions = document.createElement('div');
    actions.className = 'plainmark-footnote-popover-actions';
    if (def) {
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'plainmark-footnote-popover-jump';
      jump.textContent = 'Jump to definition';
      jump.addEventListener('mousedown', (e) => {
        e.preventDefault();
        view.dispatch({
          selection: { anchor: def.from },
          effects: [close_popover_effect.of(undefined)],
          scrollIntoView: true,
        });
        view.focus();
      });
      actions.appendChild(jump);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'plainmark-footnote-popover-close';
    close.setAttribute('aria-label', 'Close footnote popover');
    close.textContent = '×';
    close.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ effects: [close_popover_effect.of(undefined)] });
    });
    actions.appendChild(close);
    root.appendChild(actions);
  }

  return root;
}

function build_tooltip(state: PopoverState): Tooltip {
  return {
    pos: state.ref_from,
    end: state.ref_to,
    above: true,
    arrow: false,
    create(view): TooltipView {
      const dom = make_popover_dom(state, view);
      if (state.mode === 'hover') {
        dom.addEventListener('mouseleave', () => {
          const tracker = hover_tracker_for(view);
          tracker.cancel();
          tracker.close_timer = setTimeout(() => {
            tracker.close_timer = null;
            view.dispatch({ effects: [close_popover_effect.of({ mode: 'hover' })] });
          }, HOVER_CLOSE_DELAY_MS);
        });
        dom.addEventListener('mouseenter', () => {
          hover_tracker_for(view).cancel_close();
        });
      }
      return { dom };
    },
  };
}

const popover_tooltip_provider = showTooltip.compute([popover_state_field], (s) => {
  const state = s.field(popover_state_field, false);
  if (!state) return null;
  return build_tooltip(state);
});

function find_ref_at_target(
  view: EditorView,
  target: EventTarget | null,
): { label: string; from: number; to: number } | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(`[${FOOTNOTE_REF_ATTR}]`);
  if (!el) return null;
  const label = el.getAttribute(FOOTNOTE_REF_ATTR);
  if (!label) return null;
  const rect = el.getBoundingClientRect();
  const pos = view.posAtCoords({ x: rect.left + 1, y: rect.top + rect.height / 2 });
  if (pos == null) return null;
  return locate_reference_at(view, pos, label);
}

function locate_reference_at(
  view: EditorView,
  pos: number,
  label: string,
): { label: string; from: number; to: number } | null {
  let result: { label: string; from: number; to: number } | null = null;
  syntaxTree(view.state).iterate({
    from: Math.max(0, pos - 4),
    to: Math.min(view.state.doc.length, pos + label.length + 4),
    enter(node) {
      if (result) return false;
      if (node.name !== 'FootnoteReference') return;
      const text = view.state.doc.sliceString(node.from, node.to);
      const m = REFERENCE_EXACT_RE.exec(text);
      if (m && m[1] === label) result = { label, from: node.from, to: node.to };
      return;
    },
  });
  return result;
}

interface HoverTracker {
  timer: ReturnType<typeof setTimeout> | null;
  close_timer: ReturnType<typeof setTimeout> | null;
  cancel(): void;
  cancel_close(): void;
}

function make_hover_tracker(): HoverTracker {
  return {
    timer: null,
    close_timer: null,
    cancel() {
      if (this.timer != null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    },
    cancel_close() {
      if (this.close_timer != null) {
        clearTimeout(this.close_timer);
        this.close_timer = null;
      }
    },
  };
}

const popover_dom_handlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0) return false;
    const hit = find_ref_at_target(view, event.target);
    if (!hit) return false;
    event.preventDefault();
    view.dispatch({
      effects: [
        open_popover_effect.of({
          label: hit.label,
          ref_from: hit.from,
          ref_to: hit.to,
          mode: 'click',
        }),
      ],
    });
    return true;
  },
  mouseover(event, view) {
    const hit = find_ref_at_target(view, event.target);
    if (!hit) return false;
    const tracker = hover_tracker_for(view);
    tracker.cancel();
    tracker.cancel_close();
    tracker.timer = setTimeout(() => {
      tracker.timer = null;
      const cur = view.state.field(popover_state_field, false);
      // Don't downgrade a click-pinned popover to a hover one.
      if (cur && cur.mode === 'click') return;
      view.dispatch({
        effects: [
          open_popover_effect.of({
            label: hit.label,
            ref_from: hit.from,
            ref_to: hit.to,
            mode: 'hover',
          }),
        ],
      });
    }, HOVER_DELAY_MS);
    return false;
  },
  mouseout(event, view) {
    const from = event.target;
    if (!(from instanceof Element)) return false;
    const leaving_ref = from.closest(`[${FOOTNOTE_REF_ATTR}]`);
    if (!leaving_ref) return false;
    const to = event.relatedTarget;
    // If moving into the popover, keep it open.
    if (to instanceof Element && to.closest('.plainmark-footnote-popover')) return false;
    const tracker = hover_tracker_for(view);
    tracker.cancel();
    tracker.close_timer = setTimeout(() => {
      tracker.close_timer = null;
      view.dispatch({ effects: [close_popover_effect.of({ mode: 'hover' })] });
    }, HOVER_CLOSE_DELAY_MS);
    return false;
  },
  keydown(event, view) {
    if (event.key !== 'Escape') return false;
    const cur = view.state.field(popover_state_field, false);
    if (!cur) return false;
    view.dispatch({ effects: [close_popover_effect.of(undefined)] });
    return true;
  },
});

const hover_trackers = new WeakMap<EditorView, HoverTracker>();
function hover_tracker_for(view: EditorView): HoverTracker {
  let t = hover_trackers.get(view);
  if (!t) {
    t = make_hover_tracker();
    hover_trackers.set(view, t);
  }
  return t;
}

// Click outside a popover closes it; relies on capture phase so it fires
// before any handler that might preventDefault.
const click_outside_handler = EditorView.domEventHandlers({
  mousedown(event, view) {
    const cur = view.state.field(popover_state_field, false);
    if (!cur) return false;
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (target.closest('.plainmark-footnote-popover')) return false;
    if (target.closest(`[${FOOTNOTE_REF_ATTR}]`)) return false;
    view.dispatch({ effects: [close_popover_effect.of(undefined)] });
    return false;
  },
});

const popover_theme = EditorView.theme({
  '.plainmark-footnote-popover': {
    backgroundColor:
      'var(--plainmark-footnote-popover-background, var(--vscode-editorHoverWidget-background, var(--vscode-editor-background)))',
    border:
      '1px solid var(--plainmark-footnote-popover-border, var(--vscode-editorHoverWidget-border, currentColor))',
    padding: '0.5em 0.75em',
    maxWidth: '32em',
    borderRadius: '3px',
    fontSize: '0.95em',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  },
  '.plainmark-footnote-popover-body': {
    whiteSpace: 'pre-wrap',
  },
  '.plainmark-footnote-popover-body.broken': {
    color: 'var(--vscode-errorForeground, currentColor)',
  },
  '.plainmark-footnote-popover-actions': {
    marginTop: '0.5em',
    display: 'flex',
    gap: '0.5em',
    justifyContent: 'flex-end',
  },
  '.plainmark-footnote-popover-jump, .plainmark-footnote-popover-close': {
    background: 'transparent',
    color: 'inherit',
    border: '1px solid currentColor',
    padding: '0.15em 0.5em',
    cursor: 'pointer',
    font: 'inherit',
    borderRadius: '2px',
  },
});

export const footnote_popover_extension = [
  popover_state_field,
  popover_tooltip_provider,
  popover_dom_handlers,
  click_outside_handler,
  popover_theme,
];
