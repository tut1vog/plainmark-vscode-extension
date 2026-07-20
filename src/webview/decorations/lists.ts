import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range, RangeSet } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';
import { make_inline_decorations_plugin, type NodeHandler } from './inline_decorations.js';
import { should_reveal_for_selection } from './selection_reveal.js';

function find_first_child(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === name) return c;
  return null;
}

// The marker widget replaces the ListMark plus its trailing space, so the
// fixed-width widget box alone spans the marker column (see lists_theme).
function marker_replace_end(state: EditorState, mark_to: number): number {
  return mark_to < state.doc.length && state.doc.sliceString(mark_to, mark_to + 1) === ' '
    ? mark_to + 1
    : mark_to;
}

const list_marker_mark = Decoration.mark({ class: 'plainmark-list-marker' });
const hide_marker = Decoration.replace({});
const task_marker_hidden = Decoration.mark({ class: 'plainmark-list-marker-hidden' });

// Where the marker hide starts. Outside a quote: LINE START — leading nesting
// whitespace is swallowed so nesting comes purely from the
// --plainmark-list-depth padding. Inside a quote: the MARKER itself, for two
// reasons. First, the `> ` prefix must stay in flow — its transparent
// QuoteMark span draws the quote's nesting bar and its advance backs the
// hanging indent; hiding it kills the bar and paints the bullet at the border
// column. Second, the nesting spaces after the prefix must stay in flow too:
// the quote's per-line inline indent overrides the list depth padding, and
// that indent is the source-literal prefix advance (BQ-R-12
// quote_prefix_counts) which COUNTS those spaces — on a quoted line they ARE
// the visible nesting step.
function marker_hide_from(state: EditorState, line_from: number, mark_from: number): number {
  let quoted = false;
  syntaxTree(state).iterate({
    from: line_from,
    to: mark_from,
    enter(node) {
      if (node.name === 'QuoteMark' && node.to <= mark_from) quoted = true;
    },
  });
  return quoted ? mark_from : line_from;
}

// Nesting depth = count of enclosing ListItem ancestors (0 at the top level).
function list_depth(node: SyntaxNode): number {
  let depth = 0;
  for (let p = node.parent; p; p = p.parent) if (p.name === 'ListItem') depth++;
  return depth;
}

// Per-depth line decorations are cached so equal depths share one instance.
const list_item_lines = new Map<number, Decoration>();
function list_item_line(depth: number): Decoration {
  let deco = list_item_lines.get(depth);
  if (!deco) {
    deco = Decoration.line({
      class: 'plainmark-list-item',
      attributes: {
        style: `--plainmark-list-depth: ${depth}`,
        // Depth-cycled-glyph bucket — capped at 2 so level 3+ share one glyph.
        'data-list-depth': String(Math.min(depth, 2)),
      },
    });
    list_item_lines.set(depth, deco);
  }
  return deco;
}

class ListBulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  // The marker is drawn by the .plainmark-list-bullet::before theme rules
  // (CSS box geometry) so a plainmark.styles override takes effect live.
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'plainmark-list-bullet';
    return span;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

const bullet_replace = Decoration.replace({ widget: new ListBulletWidget() });

const list_item_handler: NodeHandler = {
  nodeNames: ['ListItem'],
  handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
    const n = node.node;
    const own_line = state.doc.lineAt(n.from);
    const line_from = own_line.from;
    const mark = find_first_child(n, 'ListMark');
    const is_ordered = mark
      ? /^\d/.test(state.doc.sliceString(mark.from, mark.to))
      : false;
    const is_task = find_first_child(n, 'Task') !== null;
    // Space-gate (Typora): a lone bullet marker with nothing after it on its own line stays plain text — otherwise the just-typed `-` is instantly swallowed by the glyph (lezer parses it as an empty list item).
    if (mark && !is_ordered && mark.to === own_line.to) return [];
    // Only ordered numbers reveal per-line, scoped to the item's own marker line so a nested-child edit cannot collapse an ancestor; bullets and tasks never reveal (Typora model).
    const revealed =
      is_ordered && should_reveal_for_selection(state, own_line.from, own_line.to);
    const depth = revealed ? 0 : list_depth(n);
    const decorations: Range<Decoration>[] = [list_item_line(depth).range(line_from)];
    if (!mark) return decorations;

    if (revealed) {
      decorations.push(list_marker_mark.range(mark.from, mark.to));
      return decorations;
    }

    // Off-line: hide the source's leading whitespace so nesting comes purely
    // from the --plainmark-list-depth padding, not from the source space count
    // — except inside a quote, where the prefix and nesting spaces stay in
    // flow (see marker_hide_from).
    const hide_from = marker_hide_from(state, line_from, mark.from);
    if (is_ordered) {
      if (mark.from > hide_from) decorations.push(hide_marker.range(hide_from, mark.from));
      decorations.push(list_marker_mark.range(mark.from, mark.to));
    } else if (is_task) {
      // Hide the raw "- " with a zero-font-size mark, not Decoration.replace — a line-leading replace widget flickers drawSelection.
      decorations.push(
        task_marker_hidden.range(hide_from, marker_replace_end(state, mark.to)),
      );
    } else {
      decorations.push(bullet_replace.range(hide_from, marker_replace_end(state, mark.to)));
    }
    return decorations;
  },
};

export function toggle_task_marker(view: EditorView, marker_from: number): boolean {
  const state = view.state;
  const node = syntaxTree(state).resolveInner(marker_from, 1);
  if (node.name !== 'TaskMarker' || node.to - node.from !== 3) return false;
  const middle = state.doc.sliceString(marker_from + 1, marker_from + 2);
  let new_byte: string;
  if (middle === ' ') new_byte = 'x';
  else if (middle === 'x' || middle === 'X') new_byte = ' ';
  else return false;
  view.dispatch({
    changes: { from: marker_from + 1, to: marker_from + 2, insert: new_byte },
    userEvent: 'input.toggle',
  });
  return true;
}

class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'plainmark-task-checkbox';
    if (this.checked) input.checked = true;
    input.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });
    input.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = view.posAtDOM(input);
      toggle_task_marker(view, pos);
    });
    return input;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

const task_checked_line = Decoration.line({ class: 'plainmark-task-checked' });

const task_handler: NodeHandler = {
  nodeNames: ['Task'],
  handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
    const marker = find_first_child(node.node, 'TaskMarker');
    if (!marker || marker.to - marker.from !== 3) return [];
    const middle = state.doc.sliceString(marker.from + 1, marker.from + 2);
    const checked = middle === 'x' || middle === 'X';

    const decorations: Range<Decoration>[] = [];
    if (checked) {
      const line_from = state.doc.lineAt(node.from).from;
      decorations.push(task_checked_line.range(line_from));
    }
    decorations.push(
      Decoration.replace({ widget: new TaskCheckboxWidget(checked) }).range(
        marker.from,
        marker.to,
      ),
    );
    return decorations;
  },
};

export const list_handlers: readonly NodeHandler[] = [list_item_handler, task_handler];

const list_decorations_plugin = make_inline_decorations_plugin(list_handlers);

// The bullet marker is never revealed (B2), so its replaced source span —
// leading whitespace + ListMark + trailing space — must navigate as one atomic
// unit, or the caret would step through hidden bytes one keypress at a time.
const list_atomic_ranges = EditorView.atomicRanges.of((view) => {
  const plugin = view.plugin(list_decorations_plugin);
  if (!plugin) return RangeSet.empty;
  const ranges: Range<Decoration>[] = [];
  plugin.decorations.between(0, view.state.doc.length, (from, to, deco) => {
    if (deco.spec.widget instanceof ListBulletWidget) ranges.push(deco.range(from, to));
  });
  // Pass sort=true defensively — `between` iterates the source RangeSet in
  // `from` order, but two adjacent ListBulletWidget replace ranges can share
  // a `from` (e.g. an empty bullet line whose marker collapses to zero width
  // alongside a re-revealed neighbour), and the source RangeSet's tie-break
  // by startSide doesn't necessarily survive the filter-and-rebuild here.
  // Without this guard, RangeSet.of throws "Ranges must be added sorted by
  // `from` position and `startSide`".
  return RangeSet.of(ranges, true);
});

const lists_theme = EditorView.theme({
  // padding-top, not margin-top: a margin-top variant desynced CM6's height map for nested lists (cumulative margins → ArrowUp / posAtCoords skipped lines). Padding is measured by getBoundingClientRect on .cm-line, so the height map stays in sync.
  '.plainmark-list-item + .plainmark-list-item': {
    paddingTop: 'var(--plainmark-list-item-spacing, 0.25em)',
  },
  // Hanging-indent: padding-left reserves (depth + 1) indent units, negative text-indent pulls the first line back one unit so the marker hangs there. --plainmark-list-depth is set per line by list_item_line(); the bullet widget is sized to one unit (below), so wrapped lines and each deeper nesting level both align to the parent's text column. Horizontal-only.
  '.plainmark-list-item': {
    paddingLeft:
      'calc((var(--plainmark-list-depth, 0) + 1) * var(--plainmark-list-indent, 1em))',
    textIndent: 'calc(-1 * var(--plainmark-list-indent, 1em))',
  },
  '.plainmark-list-marker': {
    color:
      'var(--plainmark-list-marker-color, var(--vscode-descriptionForeground, currentColor))',
  },
  '.plainmark-list-marker-hidden': { fontSize: '0' },
  // The widget span stays display:inline — an inline-block sized span here
  // distorts CM6 caret/selection height (cursor geometry derives from adjacent
  // client rects; confirmed by the CM6 maintainer on discuss.codemirror.net).
  '.plainmark-list-bullet': {
    color:
      'var(--plainmark-list-marker-color, var(--vscode-descriptionForeground, currentColor))',
  },
  // Depth-cycled markers (disc -> ring -> square; square for level 3+) drawn as
  // CSS box geometry, not font glyphs — U+25CF/25CB/25A0 resolve from different
  // faces per host (Segoe UI vs Apple Symbols), so character markers render at
  // visibly different sizes across platforms. The tiny inline-block ::before is
  // far shorter than the line box, so it cannot inflate caret height; its
  // margin-right pads the marker column out to one indent unit so the hanging
  // indent (LIST-E-4) still aligns.
  '.plainmark-list-bullet::before': {
    content: '""',
    display: 'inline-block',
    boxSizing: 'border-box',
    width: 'var(--plainmark-list-bullet-size, 0.3em)',
    height: 'var(--plainmark-list-bullet-size, 0.3em)',
    marginRight:
      'calc(var(--plainmark-list-indent, 1em) - var(--plainmark-list-bullet-size, 0.3em))',
    borderRadius: '50%',
    backgroundColor: 'currentColor',
    verticalAlign: 'middle',
  },
  '.plainmark-list-item[data-list-depth="1"] .plainmark-list-bullet::before': {
    width: 'var(--plainmark-list-bullet-2-size, 0.3em)',
    height: 'var(--plainmark-list-bullet-2-size, 0.3em)',
    marginRight:
      'calc(var(--plainmark-list-indent, 1em) - var(--plainmark-list-bullet-2-size, 0.3em))',
    backgroundColor: 'transparent',
    border: 'max(1px, 0.075em) solid currentColor',
  },
  '.plainmark-list-item[data-list-depth="2"] .plainmark-list-bullet::before': {
    width: 'var(--plainmark-list-bullet-3-size, 0.26em)',
    height: 'var(--plainmark-list-bullet-3-size, 0.26em)',
    marginRight:
      'calc(var(--plainmark-list-indent, 1em) - var(--plainmark-list-bullet-3-size, 0.26em))',
    borderRadius: '0',
  },
  '.plainmark-task-checkbox': {
    width: 'var(--plainmark-task-checkbox-size, 0.85em)',
    height: 'var(--plainmark-task-checkbox-size, 0.85em)',
    background:
      'var(--plainmark-task-checkbox-background, var(--vscode-checkbox-background, transparent))',
    borderColor:
      'var(--plainmark-task-checkbox-border-color, var(--vscode-checkbox-border, currentColor))',
    accentColor:
      'var(--plainmark-task-checkbox-mark-color, var(--vscode-checkbox-foreground, currentColor))',
    verticalAlign: 'middle',
    margin: '0 0.25em 0 0',
    cursor: 'pointer',
  },
  '.plainmark-task-checked': {
    color: 'var(--plainmark-task-checked-color, var(--vscode-descriptionForeground, inherit))',
    textDecoration: 'var(--plainmark-task-checked-decoration, line-through)',
  },
});

export const lists_extension = [list_decorations_plugin, lists_theme, list_atomic_ranges];
