import { describe, expect, it } from 'vitest';
import { refine_cjk_group_head } from './cjk_word_motion.js';

describe('refine_cjk_group_head — NAV-N-6', () => {
  it('returns null for latin-only spans', () => {
    expect(refine_cjk_group_head('hello', 10, true)).toBeNull();
    expect(refine_cjk_group_head('hello', 10, false)).toBeNull();
  });

  it('returns null for spans shorter than two characters', () => {
    expect(refine_cjk_group_head('中', 0, true)).toBeNull();
  });

  it('returns null when the span segments as a single word', () => {
    expect(refine_cjk_group_head('中文', 0, true)).toBeNull();
  });

  it('forward stops after the first CJK word', () => {
    // 你好 | 世界
    expect(refine_cjk_group_head('你好世界', 5, true)).toBe(7);
  });

  it('backward stops at the start of the last CJK word', () => {
    // start of 世界, offset from the span base
    expect(refine_cjk_group_head('你好世界', 5, false)).toBe(7);
  });

  it('segments japanese kana and kanji runs', () => {
    // これ | は | テスト
    expect(refine_cjk_group_head('これはテスト', 0, true)).toBe(2);
  });

  it('a refined boundary falls strictly inside the span', () => {
    const text = '今天天气很好';
    for (const forward of [true, false]) {
      const refined = refine_cjk_group_head(text, 0, forward);
      expect(refined).not.toBeNull();
      expect(refined as number).toBeGreaterThan(0);
      expect(refined as number).toBeLessThan(text.length);
    }
  });
});
