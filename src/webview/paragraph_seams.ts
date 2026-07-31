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

// A list may lose its guarding blank behind paragraph-like content only when
// its first line can interrupt a paragraph (CommonMark): a non-empty bullet
// item, or a non-empty ordered item numbered 1. An empty `-` item would
// re-parse as a setext underline, and `2.`-style starts as paragraph text.
const LIST_INTERRUPTS = /^ {0,3}([-+*]|1[.)])[ \t]+\S/;

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
  kind: 'para' | 'atx' | 'list';
  first: number;
  last: number;
}

// Paragraphs, ATX headings, and lists are the convertible blocks. A heading
// is safe on either side of a seam edit (line-scoped, interrupts a
// paragraph, hard-terminates); a list is safe as the FOLLOWING block under
// LIST_INTERRUPTS, and safe before a heading — but a paragraph directly
// after a list lazily continues its last item, so that pairing never
// converts. Setext headings are excluded entirely — removing the blank
// above one absorbs the preceding paragraph into its content run.
function top_level_blocks(state: EditorState): BlockSpan[] | null {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS);
  if (!tree) return null;
  const doc = state.doc;
  const spans: BlockSpan[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    const kind =
      node.name === 'Paragraph'
        ? 'para'
        : /^ATXHeading[1-6]$/.test(node.name)
          ? 'atx'
          : node.name === 'BulletList' || node.name === 'OrderedList'
            ? 'list'
            : null;
    if (!kind) continue;
    let last = doc.lineAt(node.to);
    // A node ending exactly at a line start spans through the previous line.
    if (last.from === node.to && last.number > doc.lineAt(node.from).number) {
      last = doc.line(last.number - 1);
    }
    spans.push({ kind, first: doc.lineAt(node.from).number, last: last.number });
  }
  return spans;
}

// A document-level blockquote or callout directly above a non-blank line is a
// quote-exit seam: under the no-laziness parse (BQ-E-1) that line is already
// outside the quote, so the blank is pure conventional surround — without it
// conforming renderers absorb the line into the quote. The intra-paragraph
// guards don't transfer: trailing whitespace on the quote's last line is not
// hard-break continuation (the line below is a separate block), and behind
// the blank a conforming renderer parses the next line in a fresh block
// context — exactly the house parse — so no re-parse trap exists. Interior
// carve-out lines (BQ-E-12) sit inside the quote node and never surface here.
function quote_exit_seams(state: EditorState): number[] | null {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS);
  if (!tree) return null;
  const doc = state.doc;
  const seams: number[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== 'Blockquote') continue;
    let last = doc.lineAt(node.to);
    if (last.from === node.to && last.number > doc.lineAt(node.from).number) {
      last = doc.line(last.number - 1);
    }
    if (last.number >= doc.lines) continue;
    const next = doc.line(last.number + 1);
    if (BLANK.test(next.text)) continue;
    seams.push(next.from);
  }
  return seams;
}

export function expand_paragraph_seams_spec(state: EditorState): TransactionSpec | null {
  const spans = top_level_blocks(state);
  const seams = quote_exit_seams(state);
  if (!spans || !seams) return null;
  const doc = state.doc;
  const changes: ChangeSpec[] = [];
  for (const span of spans) {
    if (span.kind !== 'para') continue;
    for (let n = span.first; n < span.last; n++) {
      const line = doc.line(n);
      const next = doc.line(n + 1);
      if (HARD_BREAK_END.test(line.text)) continue;
      if (REPARSE_TRAP.test(next.text)) continue;
      changes.push({ from: next.from, to: next.from, insert: '\n' });
    }
  }
  for (const from of seams) {
    changes.push({ from, to: from, insert: '\n' });
  }
  // Directly adjacent convertible blocks separate with a blank. Adjacent
  // paragraph lines are one Paragraph node and a paragraph line after a list
  // lazily continues it, so every adjacency seen here has a heading or a
  // list boundary — block-start contexts on both sides; parse unchanged.
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
    const a = spans[i].kind;
    const b = spans[i + 1].kind;
    // A paragraph directly after a list lazily continues its last item —
    // that blank is semantic and never removable.
    if (b === 'para' && a === 'list') continue;
    // Underline-lookalike paragraphs stay blank-guarded only behind another
    // paragraph — that is the pairing a collapse would fuse into a setext
    // heading; behind a heading the `=`/`-` run has nothing to underline.
    if (b === 'para' && a === 'para' && SETEXT_UNDERLINE.test(next_first.text)) continue;
    // Behind paragraph-like content a list keeps its blank unless its first
    // line interrupts; behind a heading anything starts fresh.
    if (b === 'list' && a !== 'atx' && !LIST_INTERRUPTS.test(next_first.text)) continue;
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
