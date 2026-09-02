import { describe, expect, it } from 'vitest';
import { cached_block_height, remember_block_height } from './widget_height_cache.js';

// No requestAnimationFrame in tier-a, so remember_block_height measures synchronously.
function fake_element(height: number): HTMLElement {
  return { getBoundingClientRect: () => ({ height }) } as unknown as HTMLElement;
}

describe('widget_height_cache', () => {
  it('returns -1 for an unmeasured key and the measured height afterwards', () => {
    expect(cached_block_height('hc:never')).toBe(-1);
    remember_block_height('hc:a', fake_element(42));
    expect(cached_block_height('hc:a')).toBe(42);
  });

  it('ignores a zero-height measurement', () => {
    remember_block_height('hc:zero', fake_element(0));
    expect(cached_block_height('hc:zero')).toBe(-1);
  });

  it('evicts the least recently touched entry past the bound', () => {
    remember_block_height('hc:first', fake_element(10));
    remember_block_height('hc:second', fake_element(11));
    for (let i = 0; i < 1000; i++) {
      // touching `first` keeps it fresh; `second` ages out
      if (i % 100 === 0) cached_block_height('hc:first');
      remember_block_height(`hc:fill-${i}`, fake_element(1 + i));
    }
    expect(cached_block_height('hc:first')).toBe(10);
    expect(cached_block_height('hc:second')).toBe(-1);
  });
});
