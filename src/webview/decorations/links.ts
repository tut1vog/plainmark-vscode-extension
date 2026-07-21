import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { SyntaxNode, SyntaxNodeRef, Tree } from '@lezer/common';
import { make_inline_decorations_plugin, type NodeHandler } from './inline_decorations.js';
import { should_reveal_for_selection } from './selection_reveal.js';
import { effective_destination } from '../link_destination.js';
import { create_logger } from '../../log.js';

const log = create_logger('widget');

const HREF_ATTR = 'data-plainmark-href';

function find_first_child(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === name) return c;
  return null;
}

function find_last_child(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let c = node.lastChild; c; c = c.prevSibling) if (c.name === name) return c;
  return null;
}

function link_marks(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LinkMark') out.push(c);
  }
  return out;
}

// Letter-spacing + transparent (same as text_styles.ts).
// Marker text stays in layout; letter-spacing pulls adjacent chars back over
// the transparent marker → no visible gap at rest. Shift on reveal returns
// (known tradeoff). See text_styles.ts comment.
const hide_marker = Decoration.mark({ class: 'plainmark-inline-marker-hidden' });
const marker_mark = Decoration.mark({ class: 'plainmark-link-marker' });
// `[ref]: url` definition lines: dimmed as editor chrome, reusing the muted
// marker color (no new stable CSS variable). See reference_definition_handler.
const definition_dim_mark = Decoration.mark({ class: 'plainmark-link-definition' });

function link_mark(href: string): Decoration {
  return Decoration.mark({
    class: 'plainmark-link',
    attributes: { [HREF_ATTR]: href },
  });
}

// Reference-link resolution (CommonMark). A `[ref]: url` definition parses as a
// block-level `LinkReference` node; a `[text][ref]` (full) or `[text][]`
// (collapsed) reference parses as a `Link` node — the SAME node type as inline
// links, distinguished only by having exactly two `LinkMark` children and no
// `(url)`. Labels match case-insensitively with internal whitespace collapsed
// (CommonMark label normalization); the first definition of a label wins.
function normalize_label(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Building the label→url map is O(document); memoize on syntax-tree identity so
// the per-`Link`-node handler does not rescan the whole tree for every
// reference. The WeakMap key is the tree, so background re-parses (new tree)
// naturally invalidate the cache.
const definitions_by_tree = new WeakMap<Tree, Map<string, string>>();

function collect_definitions(state: EditorState): Map<string, string> {
  const map = new Map<string, string>();
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'LinkReference') return;
      const label = find_first_child(node.node, 'LinkLabel');
      const url = find_first_child(node.node, 'URL');
      if (!label || !url) return;
      // LinkLabel spans `[label]`; strip the outer brackets before normalizing.
      const key = normalize_label(state.doc.sliceString(label.from + 1, label.to - 1));
      if (!key || map.has(key)) return; // first definition wins (CommonMark)
      map.set(key, effective_destination(state.doc.sliceString(url.from, url.to)));
    },
  });
  return map;
}

function get_definitions(state: EditorState): Map<string, string> {
  const tree = syntaxTree(state);
  let map = definitions_by_tree.get(tree);
  if (!map) {
    map = collect_definitions(state);
    definitions_by_tree.set(tree, map);
  }
  return map;
}

// Resolve a reference label to its definition URL anywhere in the document
// (cross-block: the definition may sit before or after the reference), or null
// when no definition matches.
function resolve_reference(state: EditorState, label: string): string | null {
  const key = normalize_label(label);
  if (!key) return null;
  return get_definitions(state).get(key) ?? null;
}

// `[text][ref]` / `[text][]` — 2 `LinkMark` children (`[`, `]`) plus a
// `LinkLabel` covering the trailing `[ref]` / `[]`. Off-caret: hide the leading
// `[` and the trailing `][ref]` run, leaving the bracketed text link-styled;
// on-caret: reveal both runs with the muted marker treatment (mirrors the
// inline-link reveal). Shortcut `[text]` (no `LinkLabel` child) is left raw.
function reference_link_decorations(
  n: SyntaxNode,
  state: EditorState,
): Range<Decoration>[] {
  const marks = link_marks(n);
  const open = marks[0];
  const close_bracket = marks[1];
  if (open.from !== n.from) return [];
  const text_from = open.to;
  const text_to = close_bracket.from;
  if (text_from >= text_to) return []; // empty bracketed text → no decoration

  const label_node = find_first_child(n, 'LinkLabel');
  // Shortcut form `[text]` has no LinkLabel child. lezer emits a `Link` node for
  // every `[...]` in prose, so a shortcut is indistinguishable from ordinary
  // bracketed text except by resolution; requiring the explicit `[ref]`/`[]`
  // tail keeps ordinary brackets untouched.
  if (!label_node) return [];
  const label_raw = state.doc.sliceString(label_node.from, label_node.to);
  const label =
    label_raw === '[]'
      ? state.doc.sliceString(text_from, text_to) // collapsed → the text is the label
      : state.doc.sliceString(label_node.from + 1, label_node.to - 1); // full → inside `[…]`

  const href = resolve_reference(state, label);
  if (href === null) return []; // unresolved reference stays raw/undecorated

  const decorations: Range<Decoration>[] = [link_mark(href).range(text_from, text_to)];
  if (should_reveal_for_selection(state, n.from, n.to)) {
    decorations.push(marker_mark.range(open.from, open.to));
    decorations.push(marker_mark.range(close_bracket.from, label_node.to));
  } else {
    decorations.push(hide_marker.range(open.from, open.to));
    decorations.push(hide_marker.range(close_bracket.from, label_node.to));
  }
  return decorations;
}

// `[text](url "title")` — children: LinkMark `[`, inline content, LinkMark `]`,
// LinkMark `(`, URL, optional LinkTitle, LinkMark `)`. Off-line: hide everything
// except the bracketed text; on-line: keep all bytes visible, style markers.
const link_handler: NodeHandler = {
  nodeNames: ['Link'],
  // Reveal: ignore the plugin's line-level `revealed`; apply Typora-style
  // selection-aware reveal via should_reveal_for_selection.
  handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
    const n = node.node;
    const marks = link_marks(n);
    // Reference link `[text][ref]` / `[text][]` — 2 LinkMarks, no `(url)`.
    if (marks.length === 2) return reference_link_decorations(n, state);
    if (marks.length < 4) return [];
    const open = marks[0];
    const close_bracket = marks[1];
    const open_paren = marks[2];
    const close_paren = marks[marks.length - 1];
    if (open.from !== n.from || close_paren.to !== n.to) return [];
    const text_from = open.to;
    const text_to = close_bracket.from;
    if (text_from >= text_to) return [];

    const url_node = find_first_child(n, 'URL');
    // The URL slice includes the `<`/`>` delimiters when the destination is the
    // CommonMark angle-bracket form — strip them so the href carries the
    // effective destination (LINK-R-3).
    const href = url_node
      ? effective_destination(state.doc.sliceString(url_node.from, url_node.to))
      : '';

    const decorations: Range<Decoration>[] = [link_mark(href).range(text_from, text_to)];

    if (should_reveal_for_selection(state, n.from, n.to)) {
      decorations.push(marker_mark.range(open.from, open.to));
      decorations.push(marker_mark.range(close_bracket.from, close_bracket.to));
      decorations.push(marker_mark.range(open_paren.from, open_paren.to));
      decorations.push(marker_mark.range(close_paren.from, close_paren.to));
      return decorations;
    }

    decorations.push(hide_marker.range(open.from, open.to));
    decorations.push(hide_marker.range(close_bracket.from, close_paren.to));
    return decorations;
  },
};

// `[ref]: url` reference definition — dimmed as editor chrome (LINK-E-3). The
// whole `LinkReference` span (label, colon, URL, optional title) renders in the
// muted marker color; nothing is hidden, no line is removed, and there is no
// caret reveal — the bytes stay fully visible and editable at all times.
const reference_definition_handler: NodeHandler = {
  nodeNames: ['LinkReference'],
  handle(node: SyntaxNodeRef): Range<Decoration>[] {
    return [definition_dim_mark.range(node.from, node.to)];
  },
};

// CommonMark `<url>` — Lezer shape: Autolink → [LinkMark `<`, URL, LinkMark `>`].
// The GFM bare-URL form does NOT produce an Autolink node — it emits a top-level
// URL node directly (see bare_url_handler below).
const autolink_handler: NodeHandler = {
  nodeNames: ['Autolink'],
  handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
    const n = node.node;
    const url_node = find_first_child(n, 'URL');
    const open = find_first_child(n, 'LinkMark');
    const close = find_last_child(n, 'LinkMark');
    if (!url_node || !open || !close || open === close) return [];

    const href = state.doc.sliceString(url_node.from, url_node.to);
    const decorations: Range<Decoration>[] = [
      link_mark(href).range(url_node.from, url_node.to),
    ];

    if (should_reveal_for_selection(state, n.from, n.to)) {
      decorations.push(marker_mark.range(open.from, open.to));
      decorations.push(marker_mark.range(close.from, close.to));
    } else {
      decorations.push(hide_marker.range(open.from, open.to));
      decorations.push(hide_marker.range(close.from, close.to));
    }
    return decorations;
  },
};

// GFM bare-URL autolink — the parser emits a top-level URL node (no Autolink
// wrap), `node_modules/@lezer/markdown/dist/index.js:2260`. The same URL node
// type also appears as a child of Link / Image / Autolink / LinkReference,
// owned by their respective handlers — filter on parent to avoid overlap.
const URL_PARENT_OWNED = new Set(['Link', 'Image', 'Autolink', 'LinkReference']);

const bare_url_handler: NodeHandler = {
  nodeNames: ['URL'],
  handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
    const parent = node.node.parent;
    if (parent && URL_PARENT_OWNED.has(parent.name)) return [];
    const href = state.doc.sliceString(node.from, node.to);
    return [link_mark(href).range(node.from, node.to)];
  },
};

export const link_handlers: readonly NodeHandler[] = [
  link_handler,
  reference_definition_handler,
  autolink_handler,
  bare_url_handler,
];

const links_theme = EditorView.theme({
  '.plainmark-link': {
    color: 'var(--plainmark-link-color, var(--vscode-textLink-foreground, currentColor))',
    textDecoration: 'var(--plainmark-link-decoration, underline)',
    cursor: 'var(--plainmark-link-cursor, text)',
  },
  // Noop-default hover (PatternFly theming-hooks idiom) — a plain click never follows (modifier-only navigation), so hover must not advertise "click to follow".
  '.plainmark-link:hover': {
    color:
      'var(--plainmark-link-color-hover, var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground, currentColor)))',
    textDecoration: 'var(--plainmark-link-decoration-hover, underline)',
  },
  '.plainmark-link-marker': {
    color:
      'var(--plainmark-link-marker-color, var(--vscode-descriptionForeground, currentColor))',
  },
  // Reference-definition line dim — reuses the muted marker color (no new
  // stable CSS variable), so `[ref]: url` lines read as chrome, not prose.
  '.plainmark-link-definition': {
    color:
      'var(--plainmark-link-marker-color, var(--vscode-descriptionForeground, currentColor))',
  },
});

function dispatch_link_click(href: string): void {
  document.dispatchEvent(
    new CustomEvent('plainmark-link-click', { bubbles: true, detail: { href } }),
  );
}

// Navigation fires on `click` (post-mouseup), not `mousedown`. Deferring to
// release lets the pointer-state reveal gate finish its cycle before
// navigation, and the mousedown-snapshot href survives the mouseup layout
// shift (markers reveal, hidden bytes flip to inline) that can move the link
// span out from under the click coords. Only Cmd/Ctrl+click navigates; a plain
// click always defers to caret placement. Module-level state is safe — only
// one click sequence is in flight at a time.
// Correct only for the single production webview / single EditorView realm; a second realm would share this in-flight href.
let mousedown_link_href: string | null = null;

const link_click_handler = EditorView.domEventHandlers({
  mousedown(event) {
    mousedown_link_href = null;
    if (event.button !== 0) return false;
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const link = target.closest(`[${HREF_ATTR}]`);
    if (!link) return false;
    const href = link.getAttribute(HREF_ATTR);
    if (!href) {
      log.debug('link mousedown: span has no href');
      return false;
    }
    mousedown_link_href = href;
    // Defer to CM6's default handler so the caret moves to the click position;
    // navigation (if any) fires on click after mouseup. preventDefault is NOT
    // called here — the press needs to count as a caret-placement gesture too.
    return false;
  },
  click(event) {
    const href = mousedown_link_href;
    mousedown_link_href = null;
    if (href === null) return false;
    if (event.button !== 0) return false;
    if (!(event.metaKey || event.ctrlKey)) {
      log.debug('plain link click: defer to caret placement');
      return false;
    }
    // Navigate to the mousedown-snapshot href, not a target re-resolved here:
    // the mouseup reveal shifts DOM layout before `click` fires, so the element
    // under the click coords may no longer be the link span.
    event.preventDefault();
    log.debug('link click dispatching', { href_len: href.length });
    dispatch_link_click(href);
    return true;
  },
});

export const links_extension = [
  make_inline_decorations_plugin(link_handlers),
  links_theme,
  link_click_handler,
];
