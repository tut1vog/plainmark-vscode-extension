// Off-screen block widgets seed CM6's height map at one line-height while their
// estimatedHeight is the default -1; rendered math / mermaid / images are far
// taller, so a fast scrollbar drag lays out against a wrong height map and the
// viewport snaps back on release once real heights are measured. Cache each
// block's measured height and feed it back through estimatedHeight so the map is
// accurate on every render after the first measurement.

const measured_heights = new Map<string, number>();

// Cached px height for a block widget, or -1 (CM6's "measure lazily" sentinel)
// when this content has never been measured.
export function cached_block_height(key: string): number {
  return measured_heights.get(key) ?? -1;
}

// Measure `dom` after layout and store its height under `key`. A detached or
// zero-height node is ignored so a destroyed-before-frame widget can't poison
// the cache with 0.
export function remember_block_height(key: string, dom: HTMLElement): void {
  const measure = (): void => {
    const height = dom.getBoundingClientRect().height;
    if (height > 0) measured_heights.set(key, height);
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(measure);
  } else {
    measure();
  }
}
