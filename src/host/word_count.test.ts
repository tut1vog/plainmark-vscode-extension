import { describe, it, expect } from 'vitest';
import { count_words, word_count_label } from './word_count.js';

describe('count_words — SHELL-C-13', () => {
  it('empty document counts zero', () => {
    expect(count_words('')).toBe(0);
  });

  it('whitespace-only document counts zero', () => {
    expect(count_words('  \n\t \r\n ')).toBe(0);
  });

  it('counts whitespace-separated runs', () => {
    expect(count_words('one two three')).toBe(3);
  });

  it('a run of consecutive separators still splits into single words', () => {
    expect(count_words('one   two\n\nthree\tfour')).toBe(4);
  });

  it('CRLF and LF documents count identically', () => {
    expect(count_words('a\r\nb\r\nc')).toBe(count_words('a\nb\nc'));
  });

  it('leading and trailing whitespace add no words', () => {
    expect(count_words('  word  ')).toBe(1);
  });

  it('markdown tokens count as words (documented v1 semantics)', () => {
    // `#`, `---`, `|` are non-whitespace runs; the v1 counter does not parse markdown.
    expect(count_words('# Title\n\n---\n\n| a | b |')).toBe(8);
  });
});

describe('word_count_label — SHELL-C-13', () => {
  it('zero is plural', () => {
    expect(word_count_label(0)).toBe('0 Words');
  });

  it('one is singular', () => {
    expect(word_count_label(1)).toBe('1 Word');
  });

  it('many is plural', () => {
    expect(word_count_label(123)).toBe('123 Words');
  });
});
