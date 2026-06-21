export interface OffsetRange {
  from: number;
  to: number;
}

// Inclusive overlap (touch) test: do [a.from, a.to] and [b.from, b.to] intersect
// or abut? Replaces the open-coded `a.from <= b.to && b.from <= a.to` idiom that
// was duplicated across decorations and widgets. Symmetric in a/b.
export function ranges_overlap(a: OffsetRange, b: OffsetRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}
