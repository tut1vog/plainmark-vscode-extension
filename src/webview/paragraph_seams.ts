import { ensureSyntaxTree } from '@codemirror/language';
import {
  Transaction,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

// A partial tree could misclassify a paragraph's span.
const PARSE_BUDGET_MS = 1000;

// Lines that sit inside a paragraph as plain text but would re-parse as a
// different block if a blank line came to precede them (CommonMark
// can't-interrupt constructs): indented code, non-1 ordered markers, HTML
// type 7, GFM table rows. Expanding at such a seam would change what other
// renderers see.
const REPARSE_TRAP = /^ {0,3}(\d{1,9}[.)][ \t]|<|\|)|^( {4,}|\t)/;

// A paragraph consisting of `=`/`-` runs becomes a setext heading when the
// blank line separating it from the paragraph above is removed.
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;

// Two trailing spaces or a trailing backslash: a CommonMark hard break — a
// deliberate intra-paragraph newline both transforms preserve (PARA-E-1).
const HARD_BREAK_END = /( {2}|\\)$/;

const BLANK = /^[ \t]*$/;

// House scripts that join without a separator (same classification as the
// word-count and word-motion CJK handling, extended by CJK punctuation).
const CJK_END =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303F\uFF01-\uFF60]$/u;
const CJK_START =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303F\uFF01-\uFF60]/u;

interface BlockSpan {
  kind: 'para' | 'atx';
  first: number;
  last: number;
}

// Paragraphs and ATX headings are the convertible blocks: both are safe on
// either side of a seam edit (a heading is line-scoped, interrupts a
// paragraph, and hard-terminates). Setext headings are excluded — removing
// the blank above one absorbs the preceding paragraph into its content run.
function top_level_blocks(state: EditorState): BlockSpan[] | null {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS);
  if (!tree) return null;
  const doc = state.doc;
  const spans: BlockSpan[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    const kind =
      node.name === 'Paragraph' ? 'para' : /^ATXHeading[1-6]$/.test(node.name) ? 'atx' : null;
    if (!kind) continue;
    spans.push({ kind, first: doc.lineAt(node.from).number, last: doc.lineAt(node.to).number });
  }
  return spans;
}

export function expand_paragraph_seams_spec(state: EditorState): TransactionSpec | null {
  const spans = top_level_blocks(state);
  if (!spans) return null;
  const doc = state.doc;
  const changes: ChangeSpec[] = [];
  for (const span of spans) {
    for (let n = span.first; n < span.last; n++) {
      const line = doc.line(n);
      const next = doc.line(n + 1);
      if (HARD_BREAK_END.test(line.text)) continue;
      if (REPARSE_TRAP.test(next.text)) continue;
      changes.push({ from: next.from, to: next.from, insert: '\n' });
    }
  }
  // Directly adjacent convertible blocks (a heading on at least one side —
  // adjacent paragraph lines are one Paragraph node) separate with a blank.
  // Both positions are block-start contexts, so the parse is unchanged.
  for (let i = 0; i + 1 < spans.length; i++) {
    if (spans[i + 1].first !== spans[i].last + 1) continue;
    changes.push({
      from: doc.line(spans[i + 1].first).from,
      to: doc.line(spans[i + 1].first).from,
      insert: '\n',
    });
  }
  if (changes.length === 0) return null;
  return { changes, annotations: Transaction.userEvent.of('input') };
}

export function compact_paragraph_seams_spec(state: EditorState): TransactionSpec | null {
  const spans = top_level_blocks(state);
  if (!spans) return null;
  const doc = state.doc;
  const changes: ChangeSpec[] = [];
  for (const span of spans) {
    if (span.kind !== 'para') continue;
    for (let n = span.first; n < span.last; n++) {
      const line = doc.line(n);
      const next = doc.line(n + 1);
      if (HARD_BREAK_END.test(line.text)) continue;
      const trailing = /[ \t]*$/.exec(line.text)![0];
      const leading = /^[ \t]*/.exec(next.text)![0];
      const before = line.text.slice(0, line.text.length - trailing.length);
      const after = next.text.slice(leading.length);
      const seamless = CJK_END.test(before) && CJK_START.test(after);
      changes.push({
        from: line.to - trailing.length,
        to: next.from + leading.length,
        insert: seamless ? '' : ' ',
      });
    }
  }
  for (let i = 0; i + 1 < spans.length; i++) {
    const prev_last = doc.line(spans[i].last);
    const next_first = doc.line(spans[i + 1].first);
    if (next_first.number <= prev_last.number + 1) continue;
    let all_blank = true;
    for (let n = prev_last.number + 1; n < next_first.number; n++) {
      if (!BLANK.test(doc.line(n).text)) {
        all_blank = false;
        break;
      }
    }
    if (!all_blank) continue;
    // Underline-lookalike paragraphs stay blank-guarded only behind another
    // paragraph — that is the pairing a collapse would fuse into a setext
    // heading; behind a heading the `=`/`-` run has nothing to underline.
    if (
      spans[i].kind === 'para' &&
      spans[i + 1].kind === 'para' &&
      SETEXT_UNDERLINE.test(next_first.text)
    )
      continue;
    changes.push({ from: prev_last.to, to: next_first.from - 1 });
  }
  if (changes.length === 0) return null;
  return { changes, annotations: Transaction.userEvent.of('delete') };
}

export function expand_paragraph_seams(view: EditorView): boolean {
  const spec = expand_paragraph_seams_spec(view.state);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}

export function compact_paragraph_seams(view: EditorView): boolean {
  const spec = compact_paragraph_seams_spec(view.state);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}
