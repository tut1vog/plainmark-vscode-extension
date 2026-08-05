import { ensureSyntaxTree } from '@codemirror/language';
import {
  Transaction,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

// A partial tree could misclassify a block's kind or span.
const PARSE_BUDGET_MS = 1000;

const BLANK = /^[ \t]*$/;

// A list can interrupt a paragraph only when its first line is a non-empty
// bullet or a non-empty ordered item numbered 1 (CommonMark).
const LIST_INTERRUPTS = /^ {0,3}([-+*]|1[.)])[ \t]+\S/;

// A bare `=`/`-` run directly under paragraph text is a setext underline.
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;

type Kind =
  | 'frontmatter'
  | 'heading'
  | 'para'
  | 'list'
  | 'quote'
  | 'fence'
  | 'indented_code'
  | 'table'
  | 'math'
  | 'hr'
  | 'html'
  | 'definition'
  | 'setext'
  | 'opaque';

const KIND_BY_NODE: Record<string, Kind> = {
  FrontMatter: 'frontmatter',
  Paragraph: 'para',
  BulletList: 'list',
  OrderedList: 'list',
  Blockquote: 'quote',
  FencedCode: 'fence',
  CodeBlock: 'indented_code',
  Table: 'table',
  BlockMath: 'math',
  HorizontalRule: 'hr',
  HTMLBlock: 'html',
  CommentBlock: 'html',
  ProcessingInstructionBlock: 'html',
  FootnoteDefinition: 'definition',
  LinkReference: 'definition',
  SetextHeading1: 'setext',
  SetextHeading2: 'setext',
};

// Blocks whose extent runs until a blank line: without one the block below
// merges into them (two tables fuse, a second quote joins the first) or is
// swallowed as continuation (a paragraph after a list or a definition).
const CLOSED_BY_BLANK: ReadonlySet<Kind> = new Set([
  'list',
  'quote',
  'indented_code',
  'table',
  'html',
  'definition',
]);

// Above a heading a blank reads as the section break; behind these three the
// break already exists (doc top after frontmatter, a heading stack, a rule).
const NO_BLANK_ABOVE_HEADING: ReadonlySet<Kind> = new Set(['frontmatter', 'heading', 'hr']);

interface Block {
  kind: Kind;
  first: number;
  last: number;
}

function top_level_blocks(state: EditorState): Block[] | null {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS);
  if (!tree) return null;
  const doc = state.doc;
  const blocks: Block[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    const kind = /^ATXHeading[1-6]$/.test(node.name)
      ? 'heading'
      : (KIND_BY_NODE[node.name] ?? 'opaque');
    let last = doc.lineAt(node.to);
    // A node ending exactly at a line start spans through the previous line.
    if (last.from === node.to && last.number > doc.lineAt(node.from).number) {
      last = doc.line(last.number - 1);
    }
    blocks.push({ kind, first: doc.lineAt(node.from).number, last: last.number });
  }
  return blocks;
}

// CommonMark's can-interrupt-a-paragraph test, conservative on HTML: every
// `<`-led block keeps its blank rather than carrying the type 1-6 tag table
// (the same conservative line PARA-I-5's re-parse guard takes).
function can_interrupt_paragraph(block: Block, state: EditorState): boolean {
  const first_line = state.doc.line(block.first).text;
  switch (block.kind) {
    case 'indented_code':
    case 'table':
    case 'definition':
    case 'html':
      return false;
    case 'list':
      return LIST_INTERRUPTS.test(first_line);
    case 'hr':
    case 'para':
      return !SETEXT_UNDERLINE.test(first_line);
    default:
      return true;
  }
}

// Blank lines a seam should carry, or null when the seam is not convertible.
function desired_blanks(above: Block, below: Block, state: EditorState): number | null {
  if (above.kind === 'setext' || below.kind === 'setext') return null;
  if (above.kind === 'opaque' || below.kind === 'opaque') return null;
  if (above.kind === 'definition' && below.kind === 'definition') return 0;
  if (CLOSED_BY_BLANK.has(above.kind)) return 1;
  if (below.kind === 'heading') return NO_BLANK_ABOVE_HEADING.has(above.kind) ? 0 : 1;
  if (above.kind === 'heading') return 0;
  if (above.kind === 'para' && !can_interrupt_paragraph(below, state)) return 1;
  return 0;
}

export function prettify_seams_spec(state: EditorState): TransactionSpec | null {
  const blocks = top_level_blocks(state);
  if (!blocks) return null;
  const doc = state.doc;
  const changes: ChangeSpec[] = [];
  for (let i = 0; i + 1 < blocks.length; i++) {
    const above = blocks[i];
    const below = blocks[i + 1];
    const blanks = below.first - above.last - 1;
    let all_blank = true;
    for (let n = above.last + 1; n < below.first; n++) {
      if (!BLANK.test(doc.line(n).text)) {
        all_blank = false;
        break;
      }
    }
    if (!all_blank) continue;
    const want = desired_blanks(above, below, state);
    if (want === null || want === blanks) continue;
    if (blanks === 0) {
      changes.push({ from: doc.line(below.first).from, insert: '\n' });
      continue;
    }
    // Drop the leading blank lines of the run, newline included, so the run
    // ends at `want` lines and any kept blank keeps its own bytes.
    changes.push({ from: doc.line(above.last).to, to: doc.line(above.last + blanks - want).to });
  }
  if (changes.length === 0) return null;
  return { changes, annotations: Transaction.userEvent.of('input') };
}

export function prettify_seams(view: EditorView): boolean {
  const spec = prettify_seams_spec(view.state);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}
