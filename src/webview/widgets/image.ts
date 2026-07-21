import { syntaxTree } from '@codemirror/language';
import {
  type EditorState,
  type Range,
  RangeSet,
  StateEffect,
  StateField,
  type Text,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import {
  frozen_reveal_selection_field,
  pointer_down_field,
} from '../decorations/pointer_state.js';
import { should_reveal_for_selection } from '../decorations/selection_reveal.js';
import { effective_destination } from '../link_destination.js';
import { cached_block_height, remember_block_height } from './widget_height_cache.js';

interface ImageInfo {
  alt: string;
  url: string;
  from: number;
  to: number;
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly url: string,
    readonly resolved_src: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return (
      other.alt === this.alt &&
      other.url === this.url &&
      other.resolved_src === this.resolved_src
    );
  }

  // Off-screen seed for CM6's height map; on-screen blocks are still measured.
  get estimatedHeight(): number {
    return cached_block_height(this.resolved_src);
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'plainmark-image-block';
    // Reserve a previously-measured height so a re-scrolled image lands without
    // reflowing content below it while the browser re-decodes.
    const cached = cached_block_height(this.resolved_src);
    if (cached >= 0) container.style.minHeight = `${cached}px`;
    const img = document.createElement('img');
    img.src = this.resolved_src;
    img.alt = this.alt;
    // Height is unknown until the image decodes — cache once it lays out so the
    // next off-screen render seeds the height map at the real size.
    img.addEventListener('load', () =>
      remember_block_height(this.resolved_src, container),
    );
    // A broken <img> (especially with empty alt) collapses to an empty block in the webview — show an explicit placeholder instead.
    img.addEventListener('error', () => {
      container.classList.add('plainmark-image-broken');
      container.style.minHeight = '';
      container.replaceChildren(broken_icon(), broken_text(this.url));
    });
    container.appendChild(img);
    return container;
  }

  // WidgetType default swallows clicks; without this a click cannot place the caret inside to reveal source. Mirrors math/mermaid.
  ignoreEvent(): boolean {
    return false;
  }
}

export function resolve_image_url(raw: string, base: string | null): string | null {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!base) return null;
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function find_image_only_paragraph(paragraph: SyntaxNode, doc: Text): ImageInfo | null {
  // lezer-markdown does not emit Text nodes for plain prose inside a Paragraph;
  // bare text shows up as gaps between explicit inline nodes. Detect "image-only"
  // by checking the only inline child is Image AND surrounding gaps are whitespace.
  let image: SyntaxNode | null = null;
  for (let child = paragraph.firstChild; child; child = child.nextSibling) {
    if (child.name === 'Image') {
      if (image) return null;
      image = child;
      continue;
    }
    return null;
  }
  if (!image) return null;

  if (doc.sliceString(paragraph.from, image.from).trim().length > 0) return null;
  if (doc.sliceString(image.to, paragraph.to).trim().length > 0) return null;

  let url_node: SyntaxNode | null = null;
  for (let child = image.firstChild; child; child = child.nextSibling) {
    if (child.name === 'URL') {
      url_node = child;
      break;
    }
  }
  if (!url_node) return null;
  // Angle-bracket destinations `![alt](<a b.png>)` include the `<`/`>` in the
  // URL node slice — strip them to get the effective destination (IMG-R-6).
  const url = effective_destination(doc.sliceString(url_node.from, url_node.to));

  const alt_match = /^!\[((?:[^\]\\]|\\.)*)\]/u.exec(doc.sliceString(image.from, image.to));
  const alt = alt_match ? alt_match[1] : '';

  return { alt, url, from: paragraph.from, to: paragraph.to };
}

export const set_image_base_effect = StateEffect.define<string | null>();

export const image_base_field = StateField.define<string | null>({
  create: () => null,
  update: (value, tr) => {
    for (const e of tr.effects) if (e.is(set_image_base_effect)) return e.value;
    return value;
  },
});

function build_decorations(state: EditorState): DecorationSet {
  const base = state.field(image_base_field, false) ?? null;
  const ranges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'Document') return;
      if (node.name !== 'Paragraph') return false;
      if (node.node.parent?.name !== 'Document') return false;

      const info = find_image_only_paragraph(node.node, state.doc);
      if (!info) return false;

      if (should_reveal_for_selection(state, info.from, info.to)) return false;

      const resolved = resolve_image_url(info.url, base);
      if (!resolved) return false;

      ranges.push(
        Decoration.replace({
          block: true,
          widget: new ImageWidget(info.alt, info.url, resolved),
        }).range(info.from, info.to),
      );
      return false;
    },
  });

  return RangeSet.of(ranges, true);
}

export const image_widgets_field = StateField.define<DecorationSet>({
  create: (state) => build_decorations(state),
  update: (value, tr) => {
    const base_changed = tr.effects.some((e) => e.is(set_image_base_effect));
    // The press/release pointer-freeze flip lands as effects only (no doc or
    // selection change on release) — without this, the on-release reveal never
    // rebuilds. Mirrors math.ts / inline_decorations.ts.
    const reveal_gate_changed =
      tr.startState.field(frozen_reveal_selection_field, false) !==
        tr.state.field(frozen_reveal_selection_field, false) ||
      (tr.startState.field(pointer_down_field, false) ?? false) !==
        (tr.state.field(pointer_down_field, false) ?? false);
    // Lazy/background parsing extends the tree via effect-only transactions; rebuild on tree advance or a deep image never widgetizes until edited.
    const tree_advanced = syntaxTree(tr.startState) !== syntaxTree(tr.state);
    if (tr.docChanged || tr.selection || base_changed || reveal_gate_changed || tree_advanced) {
      return build_decorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg_el(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// Feather-style "image" glyph (frame + sun + mountain) with a diagonal slash for "broken".
function broken_icon(): SVGElement {
  const svg = svg_el('svg', {
    class: 'plainmark-image-broken-icon',
    viewBox: '0 0 24 24',
    width: '20',
    height: '20',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  });
  svg.append(
    svg_el('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2', ry: '2' }),
    svg_el('circle', { cx: '8.5', cy: '8.5', r: '1.5' }),
    svg_el('polyline', { points: '21 15 16 10 5 21' }),
    svg_el('line', { x1: '3', y1: '3', x2: '21', y2: '21' }),
  );
  return svg;
}

function broken_text(url: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'plainmark-image-broken-text';
  const label = document.createElement('span');
  label.className = 'plainmark-image-broken-label';
  label.textContent = 'Image not found';
  const path = document.createElement('span');
  path.className = 'plainmark-image-broken-path';
  path.textContent = url;
  wrap.append(label, path);
  return wrap;
}

const image_theme = EditorView.theme({
  '.plainmark-image-block': { margin: '0' },
  '.plainmark-image-block img': {
    display: 'block',
    margin: '0 auto',
    maxWidth: 'var(--plainmark-image-max-width, 100%)',
    maxHeight: 'var(--plainmark-image-max-height, none)',
  },
  '.plainmark-image-broken': {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6em',
    padding: '0.6em 0.8em',
    border: '1px dashed var(--vscode-editorWidget-border, rgba(127, 127, 127, 0.4))',
    borderRadius: '6px',
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '0.9em',
  },
  '.plainmark-image-broken-icon': { flex: '0 0 auto', opacity: '0.85' },
  '.plainmark-image-broken-text': { display: 'flex', flexDirection: 'column', minWidth: '0' },
  '.plainmark-image-broken-label': { fontWeight: '600' },
  '.plainmark-image-broken-path': {
    fontFamily: 'var(--plainmark-font-code, monospace)',
    opacity: '0.8',
    wordBreak: 'break-all',
  },
});

export const image_extension = [image_base_field, image_widgets_field, image_theme];
