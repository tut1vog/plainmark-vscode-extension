import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range, RangeSet } from '@codemirror/state';
import { reveal_gate_changed } from './pointer_state.js';
import { should_reveal_for_selection } from './selection_reveal.js';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { footnote_node_label } from './footnote_parser.js';
import type { OffsetRange } from '../ranges.js';
import {
  doc_change_regions,
  frontier_growth,
  tree_rebuilt_unbounded,
} from '../region_rebuild.js';

const FOOTNOTE_REF_ATTR = 'data-plainmark-footnote-ref';

class FootnoteRefWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly defined: boolean,
    // 1-based occurrence of the label among the rendered references — keeps `id` unique in the DOM (FN-R-5).
    readonly ordinal: number,
  ) {
    super();
  }

  eq(other: FootnoteRefWidget): boolean {
    return (
      other.label === this.label &&
      other.defined === this.defined &&
      other.ordinal === this.ordinal
    );
  }

  toDOM(): HTMLElement {
    const sup = document.createElement('sup');
    sup.className = this.defined
      ? 'plainmark-footnote-ref'
      : 'plainmark-footnote-ref broken';
    sup.setAttribute(
      'id',
      this.ordinal === 1 ? `fnref:${this.label}` : `fnref:${this.label}:${this.ordinal}`,
    );
    sup.setAttribute('role', 'doc-noteref');
    sup.setAttribute(FOOTNOTE_REF_ATTR, this.label);
    if (!this.defined) {
      sup.setAttribute('aria-label', `Undefined footnote ${this.label}`);
    }
    sup.textContent = this.defined ? this.label : '?';
    return sup;
  }

  ignoreEvent(): boolean {
    // Let mouse events reach .domEventHandlers (popover trigger) and the
    // editor (caret placement).
    return false;
  }
}

const definition_line_deco = Decoration.line({
  class: 'plainmark-footnote-definition plainmark-collapse-adjacent',
  attributes: { role: 'doc-endnote' },
});

const label_mark_deco = Decoration.mark({ class: 'plainmark-footnote-label' });

function collect_definition_labels(state: EditorState): Set<string> {
  const labels = new Set<string>();
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FootnoteDefinition') return;
      const label = footnote_node_label(state.doc, node.from, node.to);
      if (label) labels.add(label);
    },
  });
  return labels;
}

// Definition labels within a region, duplicates preserved — compared across a
// transaction to decide whether the doc-wide label set can be reused.
function region_definition_labels(state: EditorState, region: OffsetRange): string[] {
  const labels: string[] = [];
  syntaxTree(state).iterate({
    from: region.from,
    to: region.to,
    enter(node) {
      if (node.name !== 'FootnoteDefinition') return;
      const label = footnote_node_label(state.doc, node.from, node.to);
      if (label) labels.push(label);
    },
  });
  return labels;
}

function build_footnote_decorations(
  state: EditorState,
  visible_ranges: readonly { readonly from: number; readonly to: number }[],
  defined_labels: Set<string>,
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);
  const rendered_per_label = new Map<string, number>();

  for (const { from, to } of visible_ranges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'FootnoteReference') {
          const label = footnote_node_label(state.doc, node.from, node.to);
          if (!label) return;
          // Node-level reveal (matches math widget) — line-level would hide
          // every ref on the first line on initial mount (default sel at 0).
          const revealed = should_reveal_for_selection(state, node.from, node.to);
          if (revealed) return;
          const defined = defined_labels.has(label);
          const ordinal = (rendered_per_label.get(label) ?? 0) + 1;
          rendered_per_label.set(label, ordinal);
          decorations.push(
            Decoration.replace({
              widget: new FootnoteRefWidget(label, defined, ordinal),
            }).range(node.from, node.to),
          );
          return;
        }
        if (node.name === 'FootnoteDefinition') {
          const start_line = state.doc.lineAt(node.from).number;
          const end_line = state.doc.lineAt(node.to).number;
          for (let i = start_line; i <= end_line; i++) {
            const line = state.doc.line(i);
            decorations.push(definition_line_deco.range(line.from));
          }
          // FootnoteLabel child on the definition covers `[^label]:` (the
          // parser emits it as the first child spanning bytes [from,
          // label_end)).
          const child = node.node.firstChild;
          if (child && child.name === 'FootnoteLabel') {
            decorations.push(label_mark_deco.range(child.from, child.to));
          }
          return;
        }
      },
    });
  }

  return RangeSet.of(decorations, true);
}

class FootnoteDecorationsPlugin implements PluginValue {
  decorations: DecorationSet;
  private defined_labels: Set<string>;

  constructor(view: EditorView) {
    this.defined_labels = collect_definition_labels(view.state);
    this.decorations = build_footnote_decorations(
      view.state,
      view.visibleRanges,
      this.defined_labels,
    );
  }

  update(update: ViewUpdate): void {
    const gate_changed = reveal_gate_changed(update.startState, update.state);
    // Background parsing lands via effect-only transactions; without this,
    // late-parsed regions stay raw until the next edit/scroll/selection.
    const tree_advanced =
      syntaxTree(update.startState) !== syntaxTree(update.state);
    if (update.docChanged || tree_advanced) this.refresh_labels(update);
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.selectionSet ||
      gate_changed ||
      tree_advanced
    ) {
      this.decorations = build_footnote_decorations(
        update.view.state,
        update.view.visibleRanges,
        this.defined_labels,
      );
    }
  }

  // The doc-wide label recollection runs only when a bounded diff over the
  // affected regions shows the definition set actually changed; pure
  // parse-frontier growth just unions in the newly covered span's labels.
  private refresh_labels(update: ViewUpdate): void {
    if (tree_rebuilt_unbounded(update.startState, update.state, update.docChanged)) {
      this.defined_labels = collect_definition_labels(update.state);
      return;
    }
    if (update.docChanged) {
      for (const pair of doc_change_regions(
        update.startState,
        update.state,
        update.changes,
      )) {
        const before = region_definition_labels(update.startState, pair.old_region);
        const after = region_definition_labels(update.state, pair.new_region);
        if (
          before.length !== after.length ||
          before.sort().join('\x00') !== after.sort().join('\x00')
        ) {
          this.defined_labels = collect_definition_labels(update.state);
          return;
        }
      }
    }
    const growth = frontier_growth(
      update.startState,
      update.state,
      update.docChanged ? update.changes : null,
    );
    if (growth) {
      for (const label of region_definition_labels(update.state, growth)) {
        this.defined_labels.add(label);
      }
    }
  }
}

export const footnote_decorations_plugin = ViewPlugin.fromClass(
  FootnoteDecorationsPlugin,
  { decorations: (p) => p.decorations },
);

export const footnote_theme = EditorView.theme({
  '.plainmark-footnote-ref': {
    color:
      'var(--plainmark-footnote-marker-color, var(--vscode-textLink-foreground, currentColor))',
    fontSize: 'var(--plainmark-footnote-size, 0.75em)',
    verticalAlign: 'super',
    lineHeight: '0',
    cursor: 'pointer',
  },
  '.plainmark-footnote-ref.broken': {
    color:
      'var(--plainmark-footnote-marker-broken-color, var(--vscode-errorForeground, currentColor))',
  },
  '.plainmark-footnote-definition': {
    color:
      'var(--plainmark-footnote-definition-color, var(--vscode-descriptionForeground, inherit))',
    backgroundColor:
      'var(--plainmark-footnote-definition-background, transparent)',
    padding: 'var(--plainmark-footnote-definition-padding, 0.5em 1em)',
  },
  '.plainmark-footnote-label': {
    opacity: 'var(--plainmark-footnote-label-opacity, 0.6)',
  },
});

export { FOOTNOTE_REF_ATTR };
