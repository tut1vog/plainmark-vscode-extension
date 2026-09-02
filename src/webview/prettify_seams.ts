import {
  Transaction,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  lookup_seam_override,
  type SeamKind,
  type SeamOverride,
} from '../common/prettify_seams_config.js';
import {
  BLANK,
  INDENT_LED,
  LIST_INTERRUPTS,
  type LineSpan,
  SETEXT_UNDERLINE,
  top_level_line_spans,
} from './block_spans.js';

// Seams touching these are never converted, so they carry no configurable
// kind. CodeBlock (inert indented code, CBLK-E-1) is deliberately unmapped —
// it falls to 'opaque', freezing every seam that touches it.
type Kind = SeamKind | 'setext' | 'opaque';

const KIND_BY_NODE: Record<string, Kind> = {
  FrontMatter: 'frontmatter',
  Paragraph: 'paragraph',
  BulletList: 'list',
  OrderedList: 'list',
  Blockquote: 'quote',
  FencedCode: 'code',
  Table: 'table',
  BlockMath: 'math',
  HorizontalRule: 'rule',
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
  'table',
  'html',
  'definition',
]);

// Above a heading a blank reads as the section break; behind these three the
// break already exists (doc top after frontmatter, a heading stack, a rule).
const NO_BLANK_ABOVE_HEADING: ReadonlySet<Kind> = new Set(['frontmatter', 'heading', 'rule']);

type Block = LineSpan<Kind>;

function top_level_blocks(state: EditorState): Block[] | null {
  return top_level_line_spans(state, (name) =>
    /^ATXHeading[1-6]$/.test(name) ? 'heading' : (KIND_BY_NODE[name] ?? 'opaque'),
  );
}

// CommonMark's can-interrupt-a-paragraph test, conservative on HTML: every
// `<`-led block keeps its blank rather than carrying the type 1-6 tag table
// (the same conservative line PARA-I-5's re-parse guard takes).
function can_interrupt_paragraph(block: Block, state: EditorState): boolean {
  const first_line = state.doc.line(block.first).text;
  switch (block.kind) {
    case 'table':
    case 'definition':
    case 'html':
      return false;
    case 'list':
      return LIST_INTERRUPTS.test(first_line);
    case 'rule':
    case 'paragraph':
      return !SETEXT_UNDERLINE.test(first_line);
    default:
      return true;
  }
}

// The blank count below which the seam re-parses into something else. A
// configured override may raise a seam above its default but never below this.
function minimum_blanks(above: Block, below: Block, state: EditorState): number {
  if (above.kind === 'html') return 1;
  if (above.kind === 'definition') return below.kind === 'definition' ? 0 : 1;
  // Two quotes fuse into one; every other merge below is the trailing-row or
  // lazy-continuation kind, which the interrupt test already decides.
  if (above.kind === 'quote' && below.kind === 'quote') return 1;
  if (above.kind === 'quote' || above.kind === 'list' || above.kind === 'table') {
    return below.kind !== 'paragraph' && can_interrupt_paragraph(below, state) ? 0 : 1;
  }
  if (above.kind === 'paragraph') return can_interrupt_paragraph(below, state) ? 0 : 1;
  return 0;
}

// The shipped matrix: what the seam takes when the user has pinned nothing.
function default_blanks(above: Block, below: Block, state: EditorState): number {
  if (above.kind === 'definition' && below.kind === 'definition') return 0;
  if (CLOSED_BY_BLANK.has(above.kind)) return 1;
  if (below.kind === 'heading') return NO_BLANK_ABOVE_HEADING.has(above.kind) ? 0 : 1;
  if (above.kind === 'heading') return 0;
  if (above.kind === 'paragraph' && !can_interrupt_paragraph(below, state)) return 1;
  return 0;
}

function desired_blanks(
  above: Block,
  below: Block,
  state: EditorState,
  overrides: readonly SeamOverride[],
): number | null {
  if (above.kind === 'setext' || below.kind === 'setext') return null;
  if (above.kind === 'opaque' || below.kind === 'opaque') return null;
  const pinned = lookup_seam_override(overrides, above.kind, below.kind);
  const want = pinned ?? default_blanks(above, below, state);
  return Math.max(want, minimum_blanks(above, below, state));
}

export function prettify_seams_spec(
  state: EditorState,
  overrides: readonly SeamOverride[] = [],
): TransactionSpec | null {
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
    if (INDENT_LED.test(doc.line(above.last).text) || INDENT_LED.test(doc.line(below.first).text))
      continue;
    const want = desired_blanks(above, below, state, overrides);
    if (want === null || want === blanks) continue;
    if (want > blanks) {
      changes.push({ from: doc.line(below.first).from, insert: '\n'.repeat(want - blanks) });
      continue;
    }
    // Drop the leading blank lines of the run, newline included, so the run
    // ends at `want` lines and any kept blank keeps its own bytes.
    changes.push({ from: doc.line(above.last).to, to: doc.line(above.last + blanks - want).to });
  }
  if (changes.length === 0) return null;
  return { changes, annotations: Transaction.userEvent.of('input') };
}

export function prettify_seams(view: EditorView, overrides: readonly SeamOverride[] = []): boolean {
  const spec = prettify_seams_spec(view.state, overrides);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}
