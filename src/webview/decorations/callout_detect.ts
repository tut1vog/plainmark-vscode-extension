import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

export type CalloutType = 'note' | 'tip' | 'important' | 'warning' | 'caution' | 'unknown';

export const KNOWN_TYPES: readonly CalloutType[] = [
  'note',
  'tip',
  'important',
  'warning',
  'caution',
] as const;

export const CANONICAL_TITLE_BY_TYPE: Record<CalloutType, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
  unknown: 'Unknown',
};

export interface CalloutInfo {
  type: CalloutType;
  raw_type: string;
  fold: '-' | '+' | null;
  title: string | null;
  marker_from: number;
  marker_to: number;
}

const CALLOUT_RE = /^\[!([A-Za-z]+)\]([-+])?\s*(.*)$/;
const STRIP_QUOTE_PREFIX_RE = /^(\s*>\s?)+/;

export function detect_callout(
  state: EditorState,
  blockquote_node: SyntaxNode,
): CalloutInfo | null {
  const first_line = state.doc.lineAt(blockquote_node.from);
  const after_quotes = first_line.text.replace(STRIP_QUOTE_PREFIX_RE, '');
  const leading_ws = /^\s*/.exec(after_quotes)?.[0] ?? '';
  const stripped = after_quotes.slice(leading_ws.length);
  const match = CALLOUT_RE.exec(stripped);
  if (!match) return null;
  const [full, type_raw, fold, trailing] = match;
  const strip_len = first_line.text.length - stripped.length;
  const marker_from = first_line.from + strip_len;
  const marker_to = first_line.from + strip_len + full.length;
  const lower = type_raw.toLowerCase();
  const type: CalloutType = (KNOWN_TYPES as readonly string[]).includes(lower)
    ? (lower as CalloutType)
    : 'unknown';
  const trimmed = trailing.trim();
  return {
    type,
    raw_type: type_raw,
    fold: fold === '-' || fold === '+' ? fold : null,
    title: trimmed.length > 0 ? trimmed : null,
    marker_from,
    marker_to,
  };
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

export function synthesize_title(info: CalloutInfo): string {
  if (info.title) return info.title;
  if (info.type !== 'unknown') return CANONICAL_TITLE_BY_TYPE[info.type];
  return capitalize(info.raw_type);
}
