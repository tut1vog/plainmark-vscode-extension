import { describe, expect, it } from 'vitest';
import {
  convert_pasted_table,
  paste_table_conversion_enabled,
  table_markdown_from_html,
  table_markdown_from_tsv,
} from './paste_table.js';

const GC_TSV = [
  '方法\t优化目标\t代价 / 局限性',
  '引用计数\t立即回收，实现简单\t无法回收循环引用',
  '标记-清除\t简单，能处理循环\t暂停程序，产生碎片',
].join('\n');

describe('TBL-I-36 table_markdown_from_tsv qualification gate', () => {
  it('converts a consistent multi-line TSV payload, first line as header', () => {
    const md = table_markdown_from_tsv(GC_TSV);
    expect(md).not.toBeNull();
    const lines = (md as string).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0].startsWith('| 方法')).toBe(true);
    expect(lines[1]).toMatch(/^\| :?-+:? /);
    for (const line of lines) {
      expect(line.startsWith('| ')).toBe(true);
      expect(line.endsWith(' |')).toBe(true);
    }
  });

  it('trims cells and escapes pipes through the serializer', () => {
    const md = table_markdown_from_tsv('a \t b|c\nd\te');
    expect(md).toContain('| a ');
    expect(md).toContain('b\\|c');
  });

  it('normalizes CRLF and tolerates one trailing newline', () => {
    expect(table_markdown_from_tsv('a\tb\r\nc\td\r\n')).toEqual(
      table_markdown_from_tsv('a\tb\nc\td'),
    );
  });

  it('rejects a single line, tab-less lines, and ragged column counts', () => {
    expect(table_markdown_from_tsv('a\tb')).toBeNull();
    expect(table_markdown_from_tsv('a\tb\nplain prose line')).toBeNull();
    expect(table_markdown_from_tsv('a\tb\na\tb\tc')).toBeNull();
    expect(table_markdown_from_tsv('')).toBeNull();
  });

  it('rejects an all-empty first column (tab-indented code shape)', () => {
    expect(table_markdown_from_tsv('\tconst x = 1;\n\tconsole.log(x);')).toBeNull();
  });
});

describe('TBL-I-36 convert_pasted_table branch order', () => {
  it('converts a text-only TSV payload into the canonical P3 table (widths are source-byte lengths)', () => {
    expect(convert_pasted_table({ html: '', text: GC_TSV })).toBe(
      [
        '| 方法        | 优化目标                | 代价 / 局限性          |',
        '| ------------- | --------------------------- | --------------------------- |',
        '| 引用计数  | 立即回收，实现简单 | 无法回收循环引用    |',
        '| 标记-清除 | 简单，能处理循环    | 暂停程序，产生碎片 |',
      ].join('\n'),
    );
  });

  it('returns null for an empty payload and for plain prose', () => {
    expect(convert_pasted_table({ html: '', text: '' })).toBeNull();
    expect(convert_pasted_table({ html: '', text: 'Hello, world!' })).toBeNull();
  });
});

describe('TBL-I-37 paste_table_conversion_enabled default', () => {
  it('is enabled when no host injected a value (no window in tier-a)', () => {
    expect(paste_table_conversion_enabled()).toBe(true);
  });
});

describe('table_markdown_from_html without a DOM', () => {
  it('declines when DOMParser is unavailable (tier-b owns the HTML branch)', () => {
    expect(table_markdown_from_html('<table><tr><td>a</td><td>b</td></tr></table>')).toBeNull();
  });
});
