import { syntaxTree } from '@codemirror/language';
import {
  type EditorState,
  type Range,
  RangeSet,
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  frozen_reveal_selection_field,
  pointer_down_field,
} from '../decorations/pointer_state.js';
import { should_reveal_for_selection } from '../decorations/selection_reveal.js';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { cached_block_height, remember_block_height } from './widget_height_cache.js';
import { create_logger } from '../../log.js';

const log = create_logger('widget');

declare global {
  interface Window {
    __plainmark_mermaid?: { url: string; nonce: string };
    __plainmark_theme?: string;
  }
}

export type MermaidResult =
  | { ok: true; svg: string }
  | { ok: false; message: string };

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}

// window.PlainmarkMermaid is set by the separate dist/mermaid.js IIFE bundle.
function get_mermaid(): MermaidApi | undefined {
  return window.PlainmarkMermaid as unknown as MermaidApi | undefined;
}

function current_theme_name(): string {
  // A fixed built-in theme forces the mermaid palette regardless of VS Code's color mode (fixed-appearance contract).
  const fixed = typeof window !== 'undefined' ? window.__plainmark_theme : undefined;
  if (fixed === 'github-dark') return 'dark';
  if (fixed === 'github-light') return 'light';
  if (fixed === 'claudify') return 'light';
  if (typeof document === 'undefined') return 'light';
  const cls = document.body.classList;
  return cls.contains('vscode-dark') || cls.contains('vscode-high-contrast')
    ? 'dark'
    : 'light';
}

// Correct only for the single production webview / single EditorView realm; a second realm would share this one-shot load promise.
let mermaid_load_promise: Promise<void> | null = null;

// dist/mermaid.js is injected on first diagram encounter — diagram-free docs never load it.
export function load_mermaid(): Promise<void> {
  if (mermaid_load_promise) return mermaid_load_promise;
  const promise = new Promise<void>((resolve, reject) => {
    if (get_mermaid()) {
      resolve();
      return;
    }
    const boot = window.__plainmark_mermaid;
    if (!boot) {
      reject(new Error('mermaid bootstrap missing'));
      return;
    }
    const script = document.createElement('script');
    script.nonce = boot.nonce;
    script.src = boot.url;
    script.addEventListener('load', () => {
      if (get_mermaid()) resolve();
      else reject(new Error('mermaid bundle exposed no API'));
    });
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error('mermaid bundle failed to load'));
    });
    document.head.appendChild(script);
  });
  mermaid_load_promise = promise;
  // a transient load failure must not poison the cache — clear so the next schedule retries
  promise.catch(() => {
    mermaid_load_promise = null;
  });
  return promise;
}

function resolve_css_var(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// Mermaid bakes resolved colors into the SVG — a theme switch needs a full re-render keyed on the new theme.
// Colors resolve through the --plainmark-* layer so a built-in theme's pinned palette flows into the SVG;
// under the default theme each resolves to the same --vscode-* value as before by construction.
function configure_mermaid_theme(mermaid: MermaidApi, is_dark: boolean): void {
  const bg = resolve_css_var(
    '--plainmark-editor-background',
    resolve_css_var('--vscode-editor-background', is_dark ? '#1e1e1e' : '#ffffff'),
  );
  const fg = resolve_css_var(
    '--plainmark-editor-foreground',
    resolve_css_var('--vscode-editor-foreground', is_dark ? '#d4d4d4' : '#1e1e1e'),
  );
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    deterministicIds: true,
    theme: 'base',
    themeVariables: {
      darkMode: is_dark,
      background: bg,
      primaryColor: resolve_css_var(
        '--plainmark-mermaid-node-background',
        resolve_css_var('--vscode-editorWidget-background', is_dark ? '#252526' : '#f3f3f3'),
      ),
      primaryTextColor: fg,
      primaryBorderColor: resolve_css_var(
        '--plainmark-mermaid-node-border-color',
        resolve_css_var('--vscode-widget-border', is_dark ? '#454545' : '#c8c8c8'),
      ),
      lineColor: fg,
      edgeLabelBackground: bg,
    },
  });
}

export function mermaid_cache_key(theme: string, src: string): string {
  return `${theme}:${src}`;
}

export const set_mermaid_result = StateEffect.define<{
  theme: string;
  src: string;
  result: MermaidResult;
}>();

export const set_mermaid_theme = StateEffect.define<string>();

export const mermaid_cache_field = StateField.define<Map<string, MermaidResult>>({
  create: () => new Map(),
  update: (cache, tr) => {
    let next: Map<string, MermaidResult> | null = null;
    for (const e of tr.effects) {
      if (e.is(set_mermaid_result)) {
        if (!next) next = new Map(cache);
        next.set(mermaid_cache_key(e.value.theme, e.value.src), e.value.result);
      }
    }
    return next ?? cache;
  },
});

export const mermaid_theme_field = StateField.define<string>({
  create: () => current_theme_name(),
  update: (theme, tr) => {
    for (const e of tr.effects) {
      if (e.is(set_mermaid_theme)) return e.value;
    }
    return theme;
  },
});

// Conservative cold-cache reserve for an unrendered diagram: mermaid height has
// no a-priori formula (it depends on diagram type, layout, label lengths), so a
// fixed reserve shrinks the first-render reflow from (actual − 1 line) to
// |actual − 200|. A measured render replaces it via the height cache.
const MERMAID_DEFAULT_HEIGHT_PX = 200;

export class MermaidWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly theme: string,
    readonly result: MermaidResult | null,
  ) {
    super();
  }

  eq(other: MermaidWidget): boolean {
    if (other.src !== this.src || other.theme !== this.theme) return false;
    const a = this.result;
    const b = other.result;
    if (a === null || b === null) return a === b;
    if (a.ok && b.ok) return a.svg === b.svg;
    if (!a.ok && !b.ok) return a.message === b.message;
    return false;
  }

  // Off-screen seed for CM6's height map; on-screen blocks are still measured.
  get estimatedHeight(): number {
    const cached = cached_block_height(mermaid_cache_key(this.theme, this.src));
    return cached >= 0 ? cached : MERMAID_DEFAULT_HEIGHT_PX;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    if (this.result === null) {
      container.className = 'plainmark-mermaid-block plainmark-mermaid-pending';
      // Reserve the eventual height so the async SVG lands without reflowing the
      // content below it (cached real height, else the conservative default).
      const cached = cached_block_height(mermaid_cache_key(this.theme, this.src));
      container.style.minHeight = `${cached >= 0 ? cached : MERMAID_DEFAULT_HEIGHT_PX}px`;
      return container;
    }
    if (this.result.ok) {
      container.className = 'plainmark-mermaid-block';
      container.innerHTML = this.result.svg;
      remember_block_height(mermaid_cache_key(this.theme, this.src), container);
      return container;
    }
    container.className = 'plainmark-mermaid-block plainmark-mermaid-error';
    container.textContent = `Mermaid: ${this.result.message}`;
    return container;
  }

  // WidgetType default swallows clicks; without this a click cannot place the caret inside to reveal source. Mirrors math.ts.
  ignoreEvent(): boolean {
    return false;
  }
}

// Mermaid render is heavier than a MathJax typeset — a longer debounce keeps a multi-keystroke edit from firing a render per key.
const PREVIEW_DEBOUNCE_MS = 300;

// Correct only for the single production webview / single EditorView realm; a second realm would share this render-sequence counter.
let preview_render_seq = 0;

interface PreviewRenderState {
  timer: ReturnType<typeof setTimeout> | null;
  generation: number;
  last_good_svg: string | null;
  configured_theme: string | null;
  destroyed: boolean;
}

const preview_render_states = new WeakMap<HTMLElement, PreviewRenderState>();

function show_preview_error(
  dom: HTMLElement,
  state: PreviewRenderState,
  message: string,
  view: EditorView,
): void {
  const alert = document.createElement('div');
  alert.className = 'plainmark-mermaid-block-preview-error';
  alert.textContent = `Mermaid error: ${message}`;
  if (state.last_good_svg) {
    const stale = document.createElement('div');
    stale.className = 'plainmark-mermaid-block-preview-stale';
    stale.innerHTML = state.last_good_svg;
    dom.replaceChildren(stale, alert);
  } else {
    dom.replaceChildren(alert);
  }
  view.requestMeasure();
}

function render_block_preview(
  dom: HTMLElement,
  state: PreviewRenderState,
  src: string,
  theme: string,
  view: EditorView,
): void {
  const gen = ++state.generation;
  load_mermaid()
    .then(() => {
      if (state.destroyed || gen !== state.generation) return;
      const mermaid = get_mermaid();
      if (!mermaid) return;
      if (state.configured_theme !== theme) {
        configure_mermaid_theme(mermaid, theme === 'dark');
        state.configured_theme = theme;
      }
      log.debug('mermaid block preview render', { src_len: src.length });
      mermaid
        .render(`plainmark-mermaid-preview-${preview_render_seq++}`, src)
        .then((out) => {
          if (state.destroyed || gen !== state.generation) return;
          state.last_good_svg = out.svg;
          const diagram = document.createElement('div');
          diagram.innerHTML = out.svg;
          dom.replaceChildren(diagram);
          view.requestMeasure();
        })
        .catch((err: unknown) => {
          if (state.destroyed || gen !== state.generation) return;
          const message = err instanceof Error ? err.message : String(err);
          show_preview_error(dom, state, message, view);
        });
    })
    .catch((err: unknown) => {
      log.warn('mermaid block preview load failed', { err: String(err) });
      if (state.destroyed || gen !== state.generation) return;
      const message = err instanceof Error ? err.message : String(err);
      show_preview_error(dom, state, message, view);
    });
}

function schedule_block_preview(
  dom: HTMLElement,
  state: PreviewRenderState,
  src: string,
  theme: string,
  view: EditorView,
): void {
  if (state.timer != null) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    render_block_preview(dom, state, src, theme, view);
  }, PREVIEW_DEBOUNCE_MS);
}

export class MermaidBlockPreviewWidget extends WidgetType {
  constructor(readonly src: string, readonly theme: string) {
    super();
  }

  eq(other: MermaidBlockPreviewWidget): boolean {
    return other.src === this.src && other.theme === this.theme;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className = 'plainmark-mermaid-block-preview';
    container.style.minHeight = '1.5em';
    const state: PreviewRenderState = {
      timer: null,
      generation: 0,
      last_good_svg: null,
      configured_theme: null,
      destroyed: false,
    };
    preview_render_states.set(container, state);
    schedule_block_preview(container, state, this.src, this.theme, view);
    return container;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = preview_render_states.get(dom);
    if (!state) return false;
    schedule_block_preview(dom, state, this.src, this.theme, view);
    return true;
  }

  destroy(dom: HTMLElement): void {
    const state = preview_render_states.get(dom);
    if (!state) return;
    if (state.timer != null) clearTimeout(state.timer);
    state.destroyed = true;
  }
}

export interface MermaidBlock {
  src: string;
  from: number;
  to: number;
}

export function find_mermaid_blocks(state: EditorState): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return;
      const info_node = node.node.getChild('CodeInfo');
      if (!info_node) return;
      const info = state.doc
        .sliceString(info_node.from, info_node.to)
        .trim()
        .toLowerCase();
      if (info !== 'mermaid') return;
      const text_node = node.node.getChild('CodeText');
      const src = text_node ? state.doc.sliceString(text_node.from, text_node.to) : '';
      blocks.push({ src, from: node.from, to: node.to });
    },
  });
  return blocks;
}

function build_decorations(state: EditorState): {
  decorations: DecorationSet;
  pending: string[];
} {
  const cache = state.field(mermaid_cache_field, false) ?? new Map<string, MermaidResult>();
  const theme = state.field(mermaid_theme_field, false) ?? current_theme_name();
  const sel = state.selection.main;
  const ranges: Range<Decoration>[] = [];
  const pending: string[] = [];

  for (const block of find_mermaid_blocks(state)) {
    if (should_reveal_for_selection(state, block.from, block.to)) {
      if (sel.empty) {
        ranges.push(
          Decoration.widget({
            block: true,
            side: 1,
            widget: new MermaidBlockPreviewWidget(block.src, theme),
          }).range(block.to),
        );
      }
      continue;
    }
    const result = cache.get(mermaid_cache_key(theme, block.src)) ?? null;
    if (!result) pending.push(block.src);
    ranges.push(
      Decoration.replace({
        block: true,
        widget: new MermaidWidget(block.src, theme, result),
      }).range(block.from, block.to),
    );
  }
  return { decorations: RangeSet.of(ranges, true), pending };
}

export const mermaid_widgets_field = StateField.define<DecorationSet>({
  create: (state) => build_decorations(state).decorations,
  update: (value, tr) => {
    const relevant = tr.effects.some(
      (e) => e.is(set_mermaid_result) || e.is(set_mermaid_theme),
    );
    // The press/release pointer-freeze flip lands as effects only (no doc or
    // selection change on release) — without this, the on-release reveal never
    // rebuilds. Mirrors math.ts / inline_decorations.ts.
    const reveal_gate_changed =
      tr.startState.field(frozen_reveal_selection_field, false) !==
        tr.state.field(frozen_reveal_selection_field, false) ||
      (tr.startState.field(pointer_down_field, false) ?? false) !==
        (tr.state.field(pointer_down_field, false) ?? false);
    // Lazy/background parsing extends the tree via effect-only transactions; rebuild on tree advance or a deep mermaid block never widgetizes until edited.
    const tree_advanced = syntaxTree(tr.startState) !== syntaxTree(tr.state);
    if (tr.docChanged || tr.selection || relevant || reveal_gate_changed || tree_advanced) {
      return build_decorations(tr.state).decorations;
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

interface MermaidRenderPluginValue extends PluginValue {
  in_flight: Set<string>;
}

// Correct only for the single production webview / single EditorView realm; a second realm would share this render-sequence counter.
let render_seq = 0;

const mermaid_render_plugin = ViewPlugin.fromClass(
  class implements MermaidRenderPluginValue {
    in_flight = new Set<string>();
    load_failed = new Set<string>();
    configured_theme: string | null = null;
    theme_observer: MutationObserver | null = null;

    constructor(readonly view: EditorView) {
      if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
        this.theme_observer = new MutationObserver(() => this.on_theme_mutation());
        this.theme_observer.observe(document.body, {
          attributes: true,
          attributeFilter: ['class'],
        });
      }
      this.schedule(view.state);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.schedule(update.state);
        return;
      }
      for (const tr of update.transactions) {
        if (tr.effects.some((e) => e.is(set_mermaid_result) || e.is(set_mermaid_theme))) {
          this.schedule(update.state);
          return;
        }
      }
    }

    destroy(): void {
      this.theme_observer?.disconnect();
      this.theme_observer = null;
    }

    private on_theme_mutation(): void {
      const theme = current_theme_name();
      if (theme === this.view.state.field(mermaid_theme_field, false)) return;
      this.view.dispatch({ effects: set_mermaid_theme.of(theme) });
    }

    private schedule(state: EditorState): void {
      const { pending } = build_decorations(state);
      if (pending.length === 0 && this.load_failed.size === 0) return;
      const theme = state.field(mermaid_theme_field, false) ?? current_theme_name();
      load_mermaid()
        .then(() => {
          const mermaid = get_mermaid();
          if (!mermaid) return;
          if (this.configured_theme !== theme) {
            configure_mermaid_theme(mermaid, theme === 'dark');
            this.configured_theme = theme;
          }
          const retry = [...this.load_failed];
          this.load_failed.clear();
          this.render_pending(theme, mermaid, retry);
        })
        .catch((err: unknown) => {
          log.warn('mermaid bundle load failed', { err: String(err) });
          const message = err instanceof Error ? err.message : String(err);
          const effects = pending.map((src) => {
            this.load_failed.add(src);
            return set_mermaid_result.of({ theme, src, result: { ok: false, message } });
          });
          if (effects.length > 0) this.view.dispatch({ effects });
        });
    }

    // `retry` re-renders diagrams whose cached result is a load-failure error, so a later successful load replaces it.
    private render_pending(theme: string, mermaid: MermaidApi, retry: string[] = []): void {
      const { pending } = build_decorations(this.view.state);
      for (const src of new Set([...pending, ...retry])) {
        const key = mermaid_cache_key(theme, src);
        if (this.in_flight.has(key)) continue;
        this.in_flight.add(key);
        log.debug('mermaid render start', { src_len: src.length });
        mermaid
          .render(`plainmark-mermaid-${render_seq++}`, src)
          .then((out) => {
            this.in_flight.delete(key);
            this.view.dispatch({
              effects: set_mermaid_result.of({
                theme,
                src,
                result: { ok: true, svg: out.svg },
              }),
            });
          })
          .catch((err: unknown) => {
            this.in_flight.delete(key);
            log.warn('mermaid render failed', { src_len: src.length });
            this.view.dispatch({
              effects: set_mermaid_result.of({
                theme,
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

const mermaid_theme = EditorView.theme({
  '.plainmark-mermaid-block': {
    margin: '0',
    padding: 'var(--plainmark-mermaid-padding, 0.5em 0)',
    textAlign: 'var(--plainmark-mermaid-align, center)' as 'center',
    background: 'var(--plainmark-mermaid-background, transparent)',
    overflowX: 'auto',
  },
  '.plainmark-mermaid-block svg': {
    maxWidth: '100%',
    height: 'auto',
  },
  '.plainmark-mermaid-pending': {
    opacity: 'var(--plainmark-mermaid-pending-opacity, 0.5)',
  },
  '.plainmark-mermaid-error': {
    color: 'var(--plainmark-mermaid-error-color, var(--vscode-errorForeground, #f14c4c))',
    fontFamily: 'var(--plainmark-font-code, monospace)',
    fontSize: '0.85em',
    whiteSpace: 'pre-wrap',
    textAlign: 'left',
  },
  '.plainmark-mermaid-block-preview': {
    margin: '0',
    padding: 'var(--plainmark-mermaid-padding, 0.5em 0)',
    textAlign: 'var(--plainmark-mermaid-align, center)' as 'center',
    background:
      'var(--plainmark-mermaid-preview-background, transparent)',
    overflowX: 'auto',
    borderTop:
      '1px solid var(--plainmark-mermaid-preview-border, var(--vscode-editorWidget-border, transparent))',
  },
  '.plainmark-mermaid-block-preview svg': {
    maxWidth: '100%',
    height: 'auto',
  },
  '.plainmark-mermaid-block-preview-stale': {
    opacity: 'var(--plainmark-mermaid-pending-opacity, 0.5)',
  },
  '.plainmark-mermaid-block-preview-error': {
    color: 'var(--plainmark-mermaid-error-color, var(--vscode-errorForeground, currentColor))',
    fontFamily: 'var(--plainmark-font-code, monospace)',
    fontSize: '0.85em',
    whiteSpace: 'pre-wrap',
  },
});

export const mermaid_extension = [
  mermaid_cache_field,
  mermaid_theme_field,
  mermaid_widgets_field,
  mermaid_render_plugin,
  mermaid_theme,
];
