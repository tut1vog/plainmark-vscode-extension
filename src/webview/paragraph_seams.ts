import { ensureSyntaxTree } from '@codemirror/language';
import {
  Transaction,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { detect_callout } from './decorations/callout_detect.js';

// A partial tree could misclassify a paragraph's span.
const PARSE_BUDGET_MS = 1000;

// Lines that sit inside a paragraph as plain text but would re-parse as a
// different block if a blank line came to precede them (CommonMark
// can't-interrupt constructs): indented code, non-1 ordered markers, HTML
// type 7, GFM table rows. Expanding at such a seam would change what other
// renderers see.
const REPARSE_TRAP = /^ {0,3}(\d{1,9}[.)][ \t]|<|\|)|^( {4,}|\t)/;

// A ≥4-indent line is still indented code to CommonMark renderers even though
// the house grammar no longer parses one: a paragraph STARTING indent-led is a
// code block there, so its lines never join and its guarding blanks stay put.
const INDENT_LED = /^( {4,}|\t)/;

// A paragraph consisting of `=`/`-` runs becomes a setext heading when the
// blank line separating it from the paragraph above is removed.
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;

// A list may lose its guarding blank behind paragraph-like content only when
// its first line can interrupt a paragraph (CommonMark): a non-empty bullet
// item, or a non-empty ordered item numbered 1. An empty `-` item would
// re-parse as a setext underline, and `2.`-style starts as paragraph text.
const LIST_INTERRUPTS = /^ {0,3}([-+*]|1[.)])[ \t]+\S/;

// An empty `+`/`*` bullet cannot interrupt a paragraph but is a valid list
// item at block start, so a blank line would turn the text line into a list
// (a lone `-` is already excluded as a setext underline).
const EMPTY_LIST_MARKER = /^ {0,3}[+*][ \t]*$/;

// A line's full quote-marker prefix (`>`, `> >`, …); its absence inside a
// quote marks a BQ-E-12 absorption carve-out line, which is never split.
const QUOTE_PREFIX = /^[ \t]*>(?:[ \t]*>)*/;

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

// Interior quote seams mirror the displayed rhythm (BQ-R-13 / CALL-R-11): a
// single-`\n` seam inside a quote-nested paragraph reads as a paragraph
// break, and a nested quote's exit line already parses in the parent quote
// (no laziness, BQ-E-1) — either way a quoted blank line keeps the boundary
// for conforming renderers, which would otherwise lazily merge it. The
// callout marker→first-body seam renders tight and stays joined. Paragraphs
// under list items or other containers never surface here — only pure
// blockquote chains are entered.
function quote_interior_seams(state: EditorState): ChangeSpec[] | null {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS);
  if (!tree) return null;
  const doc = state.doc;
  const changes: ChangeSpec[] = [];
  // Several nested quotes can end above the same exit line; insert once.
  const exit_inserts = new Map<number, string>();
  let quote_depth = 0;
  tree.iterate({
    enter: (ref) => {
      if (ref.name === 'Blockquote') {
        if (quote_depth > 0) {
          let last = doc.lineAt(ref.to);
          if (last.from === ref.to && last.number > doc.lineAt(ref.from).number) {
            last = doc.line(last.number - 1);
          }
          if (last.number < doc.lines) {
            const next = doc.line(last.number + 1);
            const prefix = QUOTE_PREFIX.exec(next.text);
            // A marker-less exit line ends the outermost quote too — that
            // seam belongs to quote_exit_seams. A bare-`>` line is already
            // the separating blank.
            if (prefix && !BLANK.test(next.text.slice(prefix[0].length))) {
              exit_inserts.set(next.from, `${prefix[0]}\n`);
            }
          }
        }
        quote_depth++;
        return true;
      }
      if (ref.name !== 'Paragraph') return ref.name === 'Document';
      if (quote_depth === 0) return false;
      const node = ref.node;
      const first = doc.lineAt(node.from).number;
      const last = doc.lineAt(node.to).number;
      const parent = node.parent;
      const starts_on_callout_marker =
        parent?.name === 'Blockquote' &&
        doc.lineAt(parent.from).number === first &&
        detect_callout(state, parent) !== null;
      for (let n = first; n < last; n++) {
        if (starts_on_callout_marker && n === first) continue;
        const line = doc.line(n);
        const next = doc.line(n + 1);
        if (HARD_BREAK_END.test(line.text)) continue;
        const prefix = QUOTE_PREFIX.exec(next.text);
        if (!prefix) continue;
        const content = next.text.slice(prefix[0].length).replace(/^[ \t]/, '');
        if (REPARSE_TRAP.test(content) || EMPTY_LIST_MARKER.test(content)) continue;
        changes.push({ from: next.from, to: next.from, insert: `${prefix[0]}\n` });
      }
      return false;
    },
    leave: (ref) => {
      if (ref.name === 'Blockquote') quote_depth--;
    },
  });
  for (const [from, insert] of exit_inserts) {
    changes.push({ from, to: from, insert });
  }
  return changes;
}

export function expand_paragraph_seams_spec(state: EditorState): TransactionSpec | null {
  const spans = top_level_blocks(state);
  const seams = quote_exit_seams(state);
  const interior = quote_interior_seams(state);
  if (!spans || !seams || !interior) return null;
  const doc = state.doc;
  const changes: ChangeSpec[] = [...interior];
  for (const span of spans) {
    if (span.kind !== 'para') continue;
    for (let n = span.first; n < span.last; n++) {
      const line = doc.line(n);
      const next = doc.line(n + 1);
      if (HARD_BREAK_END.test(line.text)) continue;
      if (REPARSE_TRAP.test(next.text) || EMPTY_LIST_MARKER.test(next.text)) continue;
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
    if (INDENT_LED.test(doc.line(span.first).text)) continue;
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
    // Indented code on other renderers: below, the blank is what makes the
    // region code at all; above, the region's bytes stay untouched wholesale.
    if (INDENT_LED.test(next_first.text)) continue;
    if (a === 'para' && INDENT_LED.test(doc.line(spans[i].first).text)) continue;
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
