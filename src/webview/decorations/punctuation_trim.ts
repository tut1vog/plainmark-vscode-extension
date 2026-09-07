import type { EditorState, Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import type { HiddenRun } from './hidden_marker_runs.js';

export const PUNCTUATION_TRIM_CLASS = 'plainmark-punctuation-trim';

// Chromium's default `text-spacing-trim` classes: `！？…` belong to neither.
const OPENING = new Set('（［｛｟〈《「『【〔〖〘〚');
const CLOSING = new Set('）］｝｠〉》」』】〕〗〙〛、。，．：；');

const trim_mark = Decoration.mark({ class: PUNCTUATION_TRIM_CLASS });

export function merge_runs(runs: readonly HiddenRun[]): HiddenRun[] {
  const sorted = [...runs].sort((a, b) => a.from - b.from || a.to - b.to);
  const out: HiddenRun[] = [];
  for (const run of sorted) {
    const last = out[out.length - 1];
    if (last && run.from <= last.to) {
      if (run.to > last.to) out[out.length - 1] = { from: last.from, to: run.to };
    } else {
      out.push({ from: run.from, to: run.to });
    }
  }
  return out;
}

// A hidden marker is a zero-width inline-block, an atomic inline that stops
// the browser from seeing the fullwidth punctuation on either side of it as
// neighbours, so `），` keeps both empty half-ems. Re-apply the trim the
// browser would have made — the same character it would have trimmed.
export function punctuation_trim_decorations(
  state: EditorState,
  runs: readonly HiddenRun[],
): Range<Decoration>[] {
  const out: Range<Decoration>[] = [];
  for (const run of merge_runs(runs)) {
    if (run.from <= 0 || run.to >= state.doc.length) continue;
    const prev = state.doc.sliceString(run.from - 1, run.from);
    const next = state.doc.sliceString(run.to, run.to + 1);
    if (OPENING.has(next) && (OPENING.has(prev) || CLOSING.has(prev))) {
      out.push(trim_mark.range(run.to, run.to + 1));
    } else if (CLOSING.has(next) && CLOSING.has(prev)) {
      out.push(trim_mark.range(run.from - 1, run.from));
    }
  }
  return out;
}
