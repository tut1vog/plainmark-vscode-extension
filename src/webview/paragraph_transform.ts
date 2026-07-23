import { Transaction, type EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export type ParagraphStyle =
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'heading_4'
  | 'heading_5'
  | 'heading_6'
  | 'bulleted_list'
  | 'numbered_list'
  | 'task_list'
  | 'blockquote';

// Line model: [quote run][indent][marker][content]. Marker ops swap after the
// quote run and keep the indent; the blockquote op toggles the quote run itself.
export interface LineShape {
  quote_len: number;
  marker_start: number;
  marker_end: number;
  kind: 'heading' | 'bulleted' | 'numbered' | 'task' | 'none';
  heading_level: number;
  blank: boolean;
}

const QUOTE_RUN = /^(?:[ \t]{0,3}>[ \t]?)+/;
const HEADING = /^([ \t]{0,3})(#{1,6})[ \t]+/;
const TASK = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+\[[ xX]\][ \t]+/;
const BULLET = /^([ \t]*)[-*+][ \t]+/;
const ORDERED = /^([ \t]*)\d{1,9}[.)][ \t]+/;

export function classify_line(text: string): LineShape {
  const quote_len = QUOTE_RUN.exec(text)?.[0].length ?? 0;
  const rest = text.slice(quote_len);
  const blank = rest.trim().length === 0;
  let kind: LineShape['kind'] = 'none';
  let heading_level = 0;
  let indent = 0;
  let marker_len = 0;
  let m: RegExpExecArray | null = null;
  if ((m = HEADING.exec(rest))) {
    kind = 'heading';
    heading_level = m[2].length;
  } else if ((m = TASK.exec(rest))) {
    kind = 'task';
  } else if ((m = BULLET.exec(rest))) {
    kind = 'bulleted';
  } else if ((m = ORDERED.exec(rest))) {
    kind = 'numbered';
  }
  if (m) {
    indent = m[1].length;
    marker_len = m[0].length - indent;
  }
  return {
    quote_len,
    marker_start: quote_len + indent,
    marker_end: quote_len + indent + marker_len,
    kind,
    heading_level,
    blank,
  };
}

function heading_level_of(style: ParagraphStyle): number {
  return style.startsWith('heading_') ? Number(style.slice(-1)) : 0;
}

function is_active(shape: LineShape, style: ParagraphStyle): boolean {
  switch (style) {
    case 'bulleted_list':
      return shape.kind === 'bulleted';
    case 'numbered_list':
      return shape.kind === 'numbered';
    case 'task_list':
      return shape.kind === 'task';
    case 'blockquote':
      return shape.quote_len > 0;
    default:
      return shape.kind === 'heading' && shape.heading_level === heading_level_of(style);
  }
}

function target_prefix(style: ParagraphStyle, ordinal: number): string {
  switch (style) {
    case 'bulleted_list':
      return '- ';
    case 'numbered_list':
      return `${ordinal}. `;
    case 'task_list':
      return '- [ ] ';
    case 'blockquote':
      return '> ';
    default:
      return '#'.repeat(heading_level_of(style)) + ' ';
  }
}

// Acts on every non-blank line the selection touches: sets the target prefix
// (swapping any existing marker), or — when every such line already carries the
// target — removes it, reverting to plain paragraph.
export function paragraph_transform_spec(
  state: EditorState,
  style: ParagraphStyle,
): TransactionSpec | null {
  const doc = state.doc;
  const line_numbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const start = doc.lineAt(range.from).number;
    let end = doc.lineAt(range.to).number;
    // A selection ending exactly at a line's start does not touch that line.
    if (!range.empty && end > start && doc.lineAt(range.to).from === range.to) end--;
    for (let n = start; n <= end; n++) line_numbers.add(n);
  }

  const lines = [...line_numbers].sort((a, b) => a - b).map((n) => doc.line(n));
  const shapes = lines.map((line) => classify_line(line.text));
  const eligible = shapes.filter((s) => !s.blank);
  if (eligible.length === 0) return null;
  const active_all = eligible.every((s) => is_active(s, style));

  const changes: Array<{ from: number; to?: number; insert?: string }> = [];
  let ordinal = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const shape = shapes[i];
    if (shape.blank) continue;
    if (style === 'blockquote') {
      if (active_all) {
        changes.push({ from: line.from, to: line.from + shape.quote_len });
      } else if (shape.quote_len === 0) {
        changes.push({ from: line.from, insert: '> ' });
      }
      continue;
    }
    if (active_all) {
      changes.push({ from: line.from + shape.marker_start, to: line.from + shape.marker_end });
      continue;
    }
    const prefix = target_prefix(style, ordinal);
    if (style === 'numbered_list') ordinal++;
    if (line.text.slice(shape.marker_start, shape.marker_end) === prefix) continue;
    changes.push({
      from: line.from + shape.marker_start,
      to: line.from + shape.marker_end,
      insert: prefix,
    });
  }
  if (changes.length === 0) return null;
  return {
    changes,
    annotations: Transaction.userEvent.of('input'),
    scrollIntoView: true,
  };
}

export function apply_paragraph_transform(view: EditorView, style: ParagraphStyle): boolean {
  const spec = paragraph_transform_spec(view.state, style);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}
