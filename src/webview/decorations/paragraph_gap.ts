import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

// Constructs that own their spacing (or where a newline is content, not a
// paragraph break) — no line of these ever carries the gap. Setext headings
// are deliberately absent: Plainmark renders them as plain prose, and typing
// `-` under a paragraph transiently parses as a setext underline — excluding
// it here would flash the layout mid-bullet-typing.
const NON_PROSE_CONTEXTS = new Set([
  'FencedCode',
  'CodeBlock',
  'FrontMatter',
  'BlockMath',
  'HTMLBlock',
  'CommentBlock',
  'ProcessingInstructionBlock',
  'Table',
  'Blockquote',
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'HorizontalRule',
]);

const LIST_CONTEXTS = new Set(['BulletList', 'OrderedList']);

const gap_line = Decoration.line({ class: 'plainmark-paragraph-gap' });

// Gap-invariance across marker typing: `para\n-` parses as a setext underline,
// `para\n* ` as paragraph text, `para\n* x` as a list — all transitional states
// on the way to a bullet. Prose lines, blank lines, setext lines, AND the first
// line of a top-level list all keep the gap, so none of those reclassifications
// moves the layout vertically; only interior list lines drop to the tighter
// item spacing (which lists.ts applies via an adjacent-sibling rule).
function gap_eligible(
  tree: ReturnType<typeof syntaxTree>,
  line: { from: number; to: number; text: string },
): boolean {
  const indent = line.text.length - line.text.trimStart().length;
  const probe = Math.min(line.from + indent, line.to);
  let outermost_list: { from: number } | null = null;
  for (let n = tree.resolveInner(probe, 1); n; n = n.parent!) {
    if (NON_PROSE_CONTEXTS.has(n.name)) return false;
    if (LIST_CONTEXTS.has(n.name)) outermost_list = n;
    if (!n.parent) break;
  }
  return outermost_list === null || outermost_list.from >= line.from;
}

// A hard `\n` renders as a paragraph break: every eligible line after the
// first document line gets gap padding above it. Soft-wrapped rows share one
// .cm-line, so wrap boundaries are untouched (PARA-E-5 amendment, 2026-07-19).
function build_gap_decorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      // Blank lines included — the gap must exist the instant Enter creates
      // the line, or the first typed character reflows the layout.
      if (line.number > 1 && gap_eligible(tree, line)) {
        builder.add(line.from, line.from, gap_line);
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const paragraph_gap_plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build_gap_decorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = build_gap_decorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const paragraph_gap_theme = EditorView.theme({
  // Padding, not margin — CM6's height map excludes margins on .cm-line
  // (same rule as headings/lists, T14.1). Class doubled so a first-of-list
  // line beats `.plainmark-list-item + .plainmark-list-item` item spacing
  // deterministically (adjacent lists with switched markers).
  '.cm-line.plainmark-paragraph-gap.plainmark-paragraph-gap': {
    paddingTop: 'var(--plainmark-paragraph-gap, 0.75em)',
  },
});

export const paragraph_gap_extension = [paragraph_gap_plugin, paragraph_gap_theme];
