import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { delete_group_head, refine_cjk_group_head } from './cjk_word_motion.js';

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

  // 今天 | 天气 | 很好 — three words so the forward and backward seams differ.
  it('forward stops after the first CJK word', () => {
    expect(refine_cjk_group_head('今天天气很好', 5, true)).toBe(7);
  });

  it('backward stops at the start of the last CJK word', () => {
    expect(refine_cjk_group_head('今天天气很好', 5, false)).toBe(9);
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

describe('delete_group_head — NAV-N-7', () => {
  const state_of = (doc: string) => EditorState.create({ doc });

  it('backward stops at the last CJK word of a run', () => {
    expect(delete_group_head(state_of('今天天气很好'), 6, false)).toBe(4);
  });

  it('forward stops after the first CJK word of a run', () => {
    expect(delete_group_head(state_of('今天天气很好'), 0, true)).toBe(2);
  });

  it('backward over a latin+CJK seam takes only the CJK word', () => {
    expect(delete_group_head(state_of('hello你好'), 7, false)).toBe(5);
  });

  it('refines kana runs at segmenter boundaries', () => {
    expect(delete_group_head(state_of('これはテスト'), 6, false)).toBe(3);
  });

  it('latin words keep the upstream group walk', () => {
    expect(delete_group_head(state_of('hello world'), 11, false)).toBe(6);
    expect(delete_group_head(state_of('hello world'), 0, true)).toBe(5);
  });

  it('a multi-space run is taken alone, per the upstream single-space rule', () => {
    expect(delete_group_head(state_of('hello   '), 8, false)).toBe(5);
  });

  it('a single trailing space is taken together with a latin word', () => {
    expect(delete_group_head(state_of('hello '), 6, false)).toBe(0);
  });

  it('at a line start, backward takes the newline', () => {
    expect(delete_group_head(state_of('你好\n世界'), 3, false)).toBe(2);
  });
});

describe('NAV-N-6 NAV-N-7: whitespace at the span edge is not a word boundary', () => {
  const state_of = (doc: string) => EditorState.create({ doc });

  it('Ctrl+Backspace after `世界中国 ` deletes the last word with its space', () => {
    // upstream absorbs the single trailing space into the group; the refined
    // head must sit before 中国, not before the space
    expect(delete_group_head(state_of('世界中国 '), 5, false)).toBe(2);
  });

  it('Ctrl+Delete before ` 世界中国` lands between the words, not before the run', () => {
    expect(delete_group_head(state_of('a 世界中国'), 1, true)).toBe(4);
  });

  it('refine ignores leading and trailing whitespace segments', () => {
    expect(refine_cjk_group_head(' 世界中国', 0, true)).toBe(3);
    expect(refine_cjk_group_head('世界中国 ', 0, false)).toBe(2);
    expect(refine_cjk_group_head(' 世界 ', 0, true)).toBeNull();
  });
});
