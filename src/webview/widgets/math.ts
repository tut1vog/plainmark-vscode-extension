import { syntaxTree } from '@codemirror/language';
import {
  type EditorState,
  type Range,
  RangeSet,
  StateEffect,
  StateField,
} from '@codemirror/state';
import { type OffsetRange, ranges_overlap } from '../ranges.js';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { frozen_reveal_selection_field } from '../decorations/pointer_state.js';
import { should_reveal_for_selection } from '../decorations/selection_reveal.js';
import { load_mathjax, mathjax_loadable } from './mathjax_loader.js';
import { cached_block_height, remember_block_height } from './widget_height_cache.js';
import { create_logger } from '../../log.js';

const log = create_logger('widget');

declare global {
  interface Window {
    MathJax?: {
      tex2chtmlPromise?: (src: string, options: { display: boolean }) => Promise<HTMLElement>;
      chtmlStylesheet?: () => HTMLStyleElement;
    };
  }
}

// tex2chtmlPromise runs document.convertPromise() — it produces the math node but
// does NOT auto-inject CHTML's layout CSS (mjx-mfrac/mjx-dbox/mjx-line/mjx-num/...).
// Without these rules every mjx-* element defaults to `display: inline` and
// structured math renders as concatenated glyphs (e.g. \frac{a}{b} → "ab").
// chtmlStylesheet() returns the same <style> on every call after the first;
// subsequent calls mutate it in-place to add rules for newly-encountered wrappers.
export function ensure_chtml_stylesheet(): void {
  const mj = window.MathJax;
  if (!mj?.chtmlStylesheet) return;
  const sheet = mj.chtmlStylesheet();
  if (sheet && !sheet.isConnected) {
    document.head.appendChild(sheet);
  }
}

export function math_cache_key(display: boolean, src: string): string {
  return `${display ? 'block' : 'inline'}:${src}`;
}

export type MathResult =
  | { ok: true; html: string }
  | { ok: false; message: string };

function raw_source_text(display: boolean, src: string): string {
  return display ? `$$${src}$$` : `$${src}$`;
}

export class MathWidget extends WidgetType {
  constructor(
    readonly display: boolean,
    readonly src: string,
    readonly result: MathResult | null,
    // ADR-0010, display widgets only: a block below other content carries the
    // paragraph gap as extra widget padding-top (`plainmark-block-gap-above`);
    // a doc-top block does not. In eq() so an edit that moves the block across
    // the doc-top boundary redraws the widget.
    readonly gap_above: boolean = false,
  ) {
    super();
  }

  eq(other: MathWidget): boolean {
    if (other.display !== this.display || other.src !== this.src) return false;
    if (other.gap_above !== this.gap_above) return false;
    const a = this.result;
    const b = other.result;
    if (a === null || b === null) return a === b;
    if (a.ok && b.ok) return a.html === b.html;
    if (!a.ok && !b.ok) return a.message === b.message;
    return false;
  }

  // Off-screen seed for CM6's height map; on-screen blocks are still measured.
  // Inline math sits on a text line — leave its height to CM6 (-1).
  get estimatedHeight(): number {
    return this.display ? cached_block_height(math_cache_key(true, this.src)) : -1;
  }

  toDOM(): HTMLElement {
    const el = document.createElement(this.display ? 'div' : 'span');
    const base = this.display
      ? `plainmark-math-block${this.gap_above ? ' plainmark-block-gap-above' : ''}`
      : 'plainmark-math-inline';
    if (this.display) {
      // Reserve a previously-measured height so the async typeset lands without
      // reflowing content below it; fall back to one line when cold.
      const cached = cached_block_height(math_cache_key(true, this.src));
      el.style.minHeight = cached >= 0 ? `${cached}px` : '1.5em';
    }
    if (this.result === null) {
      if (mathjax_loadable()) {
        // ready OR lazily loading — the typeset lands once the bundle arrives
        el.className = `${base} plainmark-math-pending`;
      } else {
        // No bundle and no bootstrap to load one — show raw source, not an invisible pending span.
        el.className = `${base} plainmark-math-error`;
        el.textContent = raw_source_text(this.display, this.src);
      }
      return el;
    }
    if (this.result.ok) {
      el.className = base;
      el.innerHTML = this.result.html;
      if (this.display) remember_block_height(math_cache_key(true, this.src), el);
      return el;
    }
    el.className = `${base} plainmark-math-error`;
    el.title = this.result.message;
    el.textContent = raw_source_text(this.display, this.src);
    return el;
  }

  // WidgetType default (true) swallows clicks; returning false lets a click on
  // the rendered math place the caret and reveal raw source (MATH-I-4). But a
  // press on the block's horizontal scrollbar (offsetY past the content box)
  // must be ignored, else dragging the scrollbar of a wide formula moves the
  // caret and reveals the raw `$$…$$` source mid-drag.
  ignoreEvent(event?: Event): boolean {
    if (
      typeof MouseEvent !== 'undefined' &&
      event instanceof MouseEvent &&
      event.target instanceof HTMLElement &&
      event.target.classList.contains('plainmark-math-block') &&
      event.offsetY > event.target.clientHeight
    ) {
      return true;
    }
    return false;
  }
}

const PREVIEW_DEBOUNCE_MS = 120;

interface PreviewRenderState {
  timer: ReturnType<typeof setTimeout> | null;
  generation: number;
  last_good_html: string | null;
  destroyed: boolean;
}

const preview_render_states = new WeakMap<HTMLElement, PreviewRenderState>();

function render_block_preview(
  dom: HTMLElement,
  state: PreviewRenderState,
  src: string,
  view: EditorView,
): void {
  const mathjax = window.MathJax;
  if (!mathjax?.tex2chtmlPromise) {
    // bundle may still be lazily loading — render once it lands
    if (mathjax_loadable()) {
      load_mathjax()
        .then(() => {
          if (!state.destroyed) render_block_preview(dom, state, src, view);
        })
        .catch(() => undefined);
    }
    return;
  }
  const gen = ++state.generation;
  log.debug('math block preview typeset', { src_len: src.length });
  mathjax
    .tex2chtmlPromise(src, { display: true })
    .then((node) => {
      if (state.destroyed || gen !== state.generation) return;
      ensure_chtml_stylesheet();
      const error_el = node.querySelector('mjx-merror');
      if (error_el) {
        const message =
          error_el.getAttribute('data-mjx-error') ??
          error_el.textContent ??
          'invalid TeX';
        const alert = document.createElement('div');
        alert.className = 'plainmark-math-block-preview-error';
        alert.textContent = `TeX error: ${message}`;
        if (state.last_good_html) {
          const dimmed = document.createElement('div');
          dimmed.className = 'plainmark-math-block-preview-stale';
          dimmed.innerHTML = state.last_good_html;
          dom.replaceChildren(dimmed, alert);
        } else {
          dom.replaceChildren(alert);
        }
      } else {
        state.last_good_html = node.outerHTML;
        dom.replaceChildren(node);
      }
      view.requestMeasure();
    })
    .catch((err: unknown) => {
      log.warn('math block preview typeset failed', {
        src_len: src.length,
        err,
      });
    });
}

function schedule_block_preview(
  dom: HTMLElement,
  state: PreviewRenderState,
  src: string,
  view: EditorView,
): void {
  if (state.timer != null) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    render_block_preview(dom, state, src, view);
  }, PREVIEW_DEBOUNCE_MS);
}

export class MathBlockPreviewWidget extends WidgetType {
  constructor(readonly src: string) {
    super();
  }

  eq(other: MathBlockPreviewWidget): boolean {
    return other.src === this.src;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className = 'plainmark-math-block-preview';
    container.style.minHeight = '1.5em';
    const state: PreviewRenderState = {
      timer: null,
      generation: 0,
      last_good_html: null,
      destroyed: false,
    };
    preview_render_states.set(container, state);
    schedule_block_preview(container, state, this.src, view);
    return container;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = preview_render_states.get(dom);
    if (!state) return false;
    schedule_block_preview(dom, state, this.src, view);
    return true;
  }

  destroy(dom: HTMLElement): void {
    const state = preview_render_states.get(dom);
    if (!state) return;
    if (state.timer != null) clearTimeout(state.timer);
    state.destroyed = true;
  }
}

export const set_typeset_effect = StateEffect.define<{
  display: boolean;
  src: string;
  result: MathResult;
}>();

export const math_cache_field = StateField.define<Map<string, MathResult>>({
  create: () => new Map(),
  update: (cache, tr) => {
    let next: Map<string, MathResult> | null = null;
    for (const e of tr.effects) {
      if (e.is(set_typeset_effect)) {
        if (!next) next = new Map(cache);
        next.set(math_cache_key(e.value.display, e.value.src), e.value.result);
      }
    }
    return next ?? cache;
  },
});

export interface MathInfo {
  display: boolean;
  src: string;
  from: number;
  to: number;
}

// The document range of the inner TeX of a block `$$…$$`: the leading `$$\n` and
// trailing `\n$$` markers stripped, so the range is exactly what gets typeset.
export function block_math_content_range(
  state: EditorState,
  from: number,
  to: number,
): OffsetRange {
  const raw = state.doc.sliceString(from, to);
  const lead = raw.match(/^\$\$\s*\n?/)?.[0].length ?? 0;
  const trail = raw.match(/\n?\$\$\s*$/)?.[0].length ?? 0;
  const content_from = from + lead;
  return { from: content_from, to: Math.max(content_from, to - trail) };
}

export function find_block_math_source(
  state: EditorState,
  from: number,
  to: number,
): string {
  const r = block_math_content_range(state, from, to);
  return state.doc.sliceString(r.from, r.to);
}

// Inline math range covers both dollar marks; the inner TeX is one `$` in from each end.
export function inline_math_content_range(from: number, to: number): OffsetRange {
  return { from: from + 1, to: to - 1 };
}

export function find_inline_math_source(
  state: EditorState,
  from: number,
  to: number,
): string {
  const r = inline_math_content_range(from, to);
  return state.doc.sliceString(r.from, r.to);
}

function build_decorations(state: EditorState): {
  decorations: DecorationSet;
  pending: MathInfo[];
} {
  const cache = state.field(math_cache_field, false) ?? new Map<string, MathResult>();
  // While a pointer button is held, reveal freezes to the pre-press selection
  // (same gate as quote_reveal.ts). The block widget is height-changing, so
  // toggling it mid-drag re-maps the pointer onto shifted layout and flickers;
  // the freeze keeps it stable until release. Keyboard selection (no freeze) is
  // unaffected. Field absent in unit harnesses → falls back to the live selection.
  const sel = (state.field(frozen_reveal_selection_field, false) ?? state.selection).main;
  const ranges: Range<Decoration>[] = [];
  const pending: MathInfo[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'BlockMath') {
        const from = node.from;
        const to = node.to;
        if (ranges_overlap(sel, { from, to })) {
          ranges.push(
            Decoration.widget({
              block: true,
              side: 1,
              widget: new MathBlockPreviewWidget(
                find_block_math_source(state, from, to),
              ),
            }).range(to),
          );
          return;
        }
        // CM6 supports a `block: true` replace only over whole lines. A
        // BlockMath node starts after any leading indent (and inside quotes,
        // after the `> ` prefix), so extend the replaced range over pure-
        // whitespace margins (MATH-E-5 indent / trailing spaces) to reach the
        // line boundaries. When NON-whitespace shares a line with the node
        // (quote `> `, list `- `), a legal range does not exist: emitting the
        // partial-line widget makes CM6 split the line into a stub and mis-map
        // DOM-side edits around the widget into document edits (observed:
        // whole-block deletion, widget unicode text written into the source —
        // INV-SP-1 violations). Emit no replace widget instead; the raw
        // source stays visible and byte-safe (MATH-E-13).
        const first_line = state.doc.lineAt(from);
        const last_line = state.doc.lineAt(to);
        const before_node = state.doc.sliceString(first_line.from, from);
        const after_node = state.doc.sliceString(to, last_line.to);
        if (/\S/.test(before_node) || /\S/.test(after_node)) return;
        const src = find_block_math_source(state, from, to);
        const result = cache.get(math_cache_key(true, src)) ?? null;
        if (!result) pending.push({ display: true, src, from, to });
        ranges.push(
          Decoration.replace({
            block: true,
            widget: new MathWidget(true, src, result, first_line.number > 1),
          }).range(first_line.from, last_line.to),
        );
        return;
      }
      if (node.name === 'InlineMath') {
        const from = node.from;
        const to = node.to;
        // Shared text-style gate: a selection strictly covering `$…$` (select-all) keeps the render; block math (above) keeps its own main-range gate.
        if (should_reveal_for_selection(state, from, to)) return;
        const src = find_inline_math_source(state, from, to);
        const result = cache.get(math_cache_key(false, src)) ?? null;
        if (!result) pending.push({ display: false, src, from, to });
        ranges.push(
          Decoration.replace({
            widget: new MathWidget(false, src, result),
          }).range(from, to),
        );
      }
    },
  });

  return { decorations: RangeSet.of(ranges, true), pending };
}

export const math_widgets_field = StateField.define<DecorationSet>({
  create: (state) => build_decorations(state).decorations,
  update: (value, tr) => {
    const cache_effect = tr.effects.some((e) => e.is(set_typeset_effect));
    // The press/release frozen-selection flip lands as effects only (no doc or
    // selection change on release), so without this guard the on-release reveal
    // would never rebuild. Mirrors inline_decorations.ts.
    const frozen_changed =
      tr.startState.field(frozen_reveal_selection_field, false) !==
      tr.state.field(frozen_reveal_selection_field, false);
    // Lazy/background parsing extends the tree via effect-only transactions; rebuild on tree advance or deep block math never widgetizes until edited.
    const tree_advanced = syntaxTree(tr.startState) !== syntaxTree(tr.state);
    if (tr.docChanged || tr.selection || cache_effect || frozen_changed || tree_advanced) {
      return build_decorations(tr.state).decorations;
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

interface MathTypesetPluginValue extends PluginValue {
  in_flight: Set<string>;
}

const math_typeset_plugin = ViewPlugin.fromClass(
  class implements MathTypesetPluginValue {
    in_flight = new Set<string>();
    load_requested = false;

    constructor(readonly view: EditorView) {
      this.schedule(view.state);
    }

    // First math encounter: inject the lazy bundle, then re-schedule so the
    // already-pending widgets typeset. No bootstrap (e.g. the headless test
    // harness) is not an error — widgets already show raw source.
    private request_bundle(): void {
      if (this.load_requested) return;
      if (!mathjax_loadable()) return;
      this.load_requested = true;
      load_mathjax()
        .then(() => {
          this.schedule(this.view.state);
        })
        .catch((err: unknown) => {
          // transient failure must not blank math for the session — the next schedule retries
          this.load_requested = false;
          log.warn('mathjax bundle load failed', { err });
        });
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.schedule(update.state);
      } else {
        for (const tr of update.transactions) {
          if (tr.effects.some((e) => e.is(set_typeset_effect))) {
            this.schedule(update.state);
            break;
          }
        }
      }
    }

    private schedule(state: EditorState): void {
      // requestAnimationFrame defers dispatch out of the StateField update cycle;
      // CM6 forbids dispatching from inside an update.
      const { pending } = build_decorations(state);
      const mathjax = window.MathJax;
      if (!mathjax || !mathjax.tex2chtmlPromise) {
        if (pending.length > 0) this.request_bundle();
        return;
      }
      const tex2chtml = mathjax.tex2chtmlPromise;
      for (const { display, src } of pending) {
        const key = math_cache_key(display, src);
        if (this.in_flight.has(key)) continue;
        this.in_flight.add(key);
        log.debug('math typeset start', { display, src_len: src.length });
        tex2chtml(src, { display })
          .then((node) => {
            this.in_flight.delete(key);
            ensure_chtml_stylesheet();
            this.view.dispatch({
              effects: set_typeset_effect.of({
                display,
                src,
                result: { ok: true, html: node.outerHTML },
              }),
            });
          })
          .catch((err: unknown) => {
            this.in_flight.delete(key);
            log.warn('math typeset failed', {
              display,
              src_len: src.length,
              err,
            });
            this.view.dispatch({
              effects: set_typeset_effect.of({
                display,
                src,
                result: {
                  ok: false,
                  message: err instanceof Error ? err.message : String(err),
                },
              }),
            });
          });
      }
    }
  },
);

const math_theme = EditorView.theme({
  '.plainmark-math-block': {
    margin: '0',
    padding: 'var(--plainmark-math-padding, 0.25em 0)',
    textAlign: 'var(--plainmark-math-align, center)' as 'center',
    color: 'var(--plainmark-math-color, inherit)',
    fontSize: 'var(--plainmark-math-size, 1.21em)',
    overflowX: 'auto',
  },
  // ADR-0010: a non-doc-top math block stacks the paragraph gap on its own
  // top breathing room. The 0.25em literal mirrors --plainmark-math-padding's
  // default top component (a shorthand var's component can't be referenced);
  // the gap resolves in the block's em context (--plainmark-math-size).
  '.plainmark-math-block.plainmark-block-gap-above': {
    paddingTop: 'calc(var(--plainmark-paragraph-gap, 0.75em) + 0.25em)',
  },
  '.plainmark-math-inline': {
    color: 'var(--plainmark-math-color, inherit)',
  },
  '.plainmark-math-pending': {
    opacity: 'var(--plainmark-math-pending-opacity, 0.5)',
  },
  '.plainmark-math-error': {
    color: 'var(--vscode-errorForeground, #f14c4c)',
    fontFamily: 'var(--plainmark-font-code, monospace)',
    fontSize: '0.85em',
    whiteSpace: 'pre-wrap',
    textAlign: 'left',
  },
  '.plainmark-math-block-preview': {
    margin: '0',
    padding: 'var(--plainmark-math-padding, 0.25em 0)',
    textAlign: 'var(--plainmark-math-align, center)' as 'center',
    color: 'var(--plainmark-math-color, inherit)',
    fontSize: 'var(--plainmark-math-size, 1.21em)',
    borderTop: '1px solid var(--vscode-editorWidget-border, transparent)',
    overflowX: 'auto',
  },
  '.plainmark-math-block-preview-stale': {
    opacity: 'var(--plainmark-math-pending-opacity, 0.5)',
  },
  '.plainmark-math-block-preview-error': {
    color: 'var(--vscode-errorForeground, currentColor)',
  },
  // VS Code's webview injects scrollbar styles that leave the overflow-x bar
  // transparent until the scroller is hovered; restyle it so a wide formula's
  // scrollbar is visible at rest.
  '.plainmark-math-block::-webkit-scrollbar': { height: '10px' },
  '.plainmark-math-block-preview::-webkit-scrollbar': { height: '10px' },
  '.plainmark-math-block::-webkit-scrollbar-thumb': {
    backgroundColor: 'var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4))',
    borderRadius: '5px',
  },
  '.plainmark-math-block-preview::-webkit-scrollbar-thumb': {
    backgroundColor: 'var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4))',
    borderRadius: '5px',
  },
  '.plainmark-math-block::-webkit-scrollbar-thumb:hover': {
    backgroundColor:
      'var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, 0.7))',
  },
  '.plainmark-math-block-preview::-webkit-scrollbar-thumb:hover': {
    backgroundColor:
      'var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, 0.7))',
  },
});

export const math_extension = [
  math_cache_field,
  math_widgets_field,
  math_typeset_plugin,
  math_theme,
];
