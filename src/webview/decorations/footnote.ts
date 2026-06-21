import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range, RangeSet } from '@codemirror/state';
import { frozen_reveal_selection_field, pointer_down_field } from './pointer_state.js';
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
import {
  DEFINITION_HEAD_RE,
  FOOTNOTE_HEAD_SLICE,
  REFERENCE_EXACT_RE,
} from './footnote_parser.js';

const FOOTNOTE_REF_ATTR = 'data-plainmark-footnote-ref';

class FootnoteRefWidget extends WidgetType {
  constructor(readonly label: string, readonly defined: boolean) {
    super();
  }

  eq(other: FootnoteRefWidget): boolean {
    return other.label === this.label && other.defined === this.defined;
  }

  toDOM(): HTMLElement {
    const sup = document.createElement('sup');
    sup.className = this.defined
      ? 'plainmark-footnote-ref'
      : 'plainmark-footnote-ref broken';
    sup.setAttribute('id', `fnref:${this.label}`);
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
      const label = read_definition_label(state, node.from, node.to);
      if (label) labels.add(label);
    },
  });
  return labels;
}

function read_definition_label(
  state: EditorState,
  def_from: number,
  def_to: number,
): string | null {
  // `[^label]:` head is on the first line; FootnoteLabel child covers
  // `[^label]` (5+ bytes). We slice the text directly: skip `[^`, take up
  // to the next `]`.
  const head = state.doc.sliceString(
    def_from,
    Math.min(def_to, def_from + FOOTNOTE_HEAD_SLICE),
  );
  const m = DEFINITION_HEAD_RE.exec(head);
  return m ? m[1] : null;
}

function read_reference_label(
  state: EditorState,
  ref_from: number,
  ref_to: number,
): string | null {
  const text = state.doc.sliceString(ref_from, ref_to);
  const m = REFERENCE_EXACT_RE.exec(text);
  return m ? m[1] : null;
}

function build_footnote_decorations(
  state: EditorState,
  visible_ranges: readonly { readonly from: number; readonly to: number }[],
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const defined_labels = collect_definition_labels(state);
  const tree = syntaxTree(state);

  for (const { from, to } of visible_ranges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'FootnoteReference') {
          const label = read_reference_label(state, node.from, node.to);
          if (!label) return;
          // Node-level reveal (matches math widget) — line-level would hide
          // every ref on the first line on initial mount (default sel at 0).
          const revealed = should_reveal_for_selection(state, node.from, node.to);
          if (revealed) return;
          const defined = defined_labels.has(label);
          decorations.push(
            Decoration.replace({
              widget: new FootnoteRefWidget(label, defined),
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

  constructor(view: EditorView) {
    this.decorations = build_footnote_decorations(view.state, view.visibleRanges);
  }

  update(update: ViewUpdate): void {
    // The press/release pointer-freeze flip lands as effects only (no doc or
    // selection change on release) — without this, the on-release reveal never
    // rebuilds. Mirrors math.ts / inline_decorations.ts.
    const reveal_gate_changed =
      update.startState.field(frozen_reveal_selection_field, false) !==
        update.state.field(frozen_reveal_selection_field, false) ||
      (update.startState.field(pointer_down_field, false) ?? false) !==
        (update.state.field(pointer_down_field, false) ?? false);
    // Background parsing lands via effect-only transactions; without this,
    // late-parsed regions stay raw until the next edit/scroll/selection.
    const tree_advanced =
      syntaxTree(update.startState) !== syntaxTree(update.state);
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.selectionSet ||
      reveal_gate_changed ||
      tree_advanced
    ) {
      this.decorations = build_footnote_decorations(
        update.view.state,
        update.view.visibleRanges,
      );
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
