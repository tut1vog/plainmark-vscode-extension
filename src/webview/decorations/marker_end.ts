import type { Text } from '@codemirror/state';

// A block marker (`>`, `-`, `1.`) owns the one space after it: the hide or
// replace that covers the marker ends past that space when present.
export function marker_end_with_space(doc: Text, mark_to: number): number {
  return doc.sliceString(mark_to, mark_to + 1) === ' ' ? mark_to + 1 : mark_to;
}
