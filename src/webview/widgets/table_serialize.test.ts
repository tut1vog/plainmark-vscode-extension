import { describe, expect, it } from 'vitest';
import {
  type TableModel,
  escape_cell_text,
  parse_cell_text,
  serialize_table,
} from './table_serialize.js';

function model(
  rows: string[][],
  alignment: TableModel['alignment'] = [],
): TableModel {
  const col_count = rows[0].length;
  const align: TableModel['alignment'] = [];
  for (let c = 0; c < col_count; c++) align[c] = alignment[c] ?? null;
  return { rows, alignment: align, header_row_count: 1 };
}

function lines(model: TableModel): string[] {
  return serialize_table(model).split('\n');
}

describe('TBL-SP-4 escape_cell_text — escape unescaped pipes (markdown-source model)', () => {
  it('escapes a raw pipe to \\|', () => {
    expect(escape_cell_text('a|b')).toBe('a\\|b');
  });

  it('escapes multiple raw pipes including consecutive ones', () => {
    expect(escape_cell_text('|a||b|')).toBe('\\|a\\|\\|b\\|');
  });

  it('escapes raw pipes regardless of code-span context (no exceptions)', () => {
    expect(escape_cell_text('`a | b`')).toBe('`a \\| b`');
  });

  it('leaves text without pipes untouched', () => {
    expect(escape_cell_text('plain text')).toBe('plain text');
  });

  it('leaves an already-escaped pipe alone (no double-escape)', () => {
    expect(escape_cell_text('a\\|b')).toBe('a\\|b');
  });

  it('escapes a raw pipe that follows a literal (even-run) backslash', () => {
    // 'a\\|b' is a literal backslash then a raw pipe; the backslash run is even
    // so it is left, and the pipe still escapes — re-reads as backslash + pipe.
    expect(escape_cell_text('a\\\\|b')).toBe('a\\\\\\|b');
  });

  it('never doubles a backslash, so markdown escapes survive verbatim', () => {
    expect(escape_cell_text('a\\b')).toBe('a\\b');
    expect(escape_cell_text('\\$50')).toBe('\\$50');
    expect(escape_cell_text('C:\\path')).toBe('C:\\path');
  });
});

describe('TBL-SP-5 escape_cell_text — N4 newline to <br>', () => {
  it('rewrites \\n to <br>', () => {
    expect(escape_cell_text('line1\nline2')).toBe('line1<br>line2');
  });

  it('rewrites every \\n in a multi-line cell', () => {
    expect(escape_cell_text('a\nb\nc')).toBe('a<br>b<br>c');
  });
});

describe('TBL-SP-4 parse_cell_text — keeps markdown escapes verbatim', () => {
  it('leaves \\| intact (an escaped pipe is the markdown for a literal pipe)', () => {
    expect(parse_cell_text('a\\|b')).toBe('a\\|b');
  });

  it('leaves \\\\ intact (a literal backslash stays as its markdown escape)', () => {
    expect(parse_cell_text('a\\\\b')).toBe('a\\\\b');
  });

  it('leaves a punctuation escape like \\$ intact', () => {
    expect(parse_cell_text('\\$38-\\$45')).toBe('\\$38-\\$45');
  });

  it('converts <br> to newline case-insensitively, matching render (BR1)', () => {
    expect(parse_cell_text('a<BR>b')).toBe('a\nb');
    expect(parse_cell_text('a<Br/>b')).toBe('a\nb');
    expect(parse_cell_text('a<BR />b')).toBe('a\nb');
  });
});

describe('TBL-SP-4 TBL-SP-9 cell text round-trips at the source level', () => {
  // The cell model is verbatim markdown source: canonical source (pipes escaped,
  // soft breaks as <br>) survives escape(parse(...)) byte-identically. This is
  // the meaningful invariant now that backslashes are preserved, not doubled.
  it('escape(parse(source)) reproduces canonical cell source byte-for-byte', () => {
    const canonical_sources = [
      'plain',
      'a\\|b',
      '\\|',
      'C:\\path',
      'a\\\\b',
      'trailing\\',
      '\\$38-\\$45',
      '\\*literal\\*',
      '`code \\| x`',
      'line1<br>line2',
    ];
    for (const src of canonical_sources) {
      expect(escape_cell_text(parse_cell_text(src))).toBe(src);
    }
  });

  it('a raw (user-typed) pipe is normalized to \\| and is then stable', () => {
    const once = escape_cell_text('a|b');
    expect(once).toBe('a\\|b');
    expect(escape_cell_text(parse_cell_text(once))).toBe(once);
  });
});

describe('TBL-SP-5 parse_cell_text — N4 reverse', () => {
  it('turns <br> into \\n', () => {
    expect(parse_cell_text('a<br>b')).toBe('a\nb');
  });

  it('turns <br/> into \\n', () => {
    expect(parse_cell_text('a<br/>b')).toBe('a\nb');
  });

  it('turns <br /> into \\n', () => {
    expect(parse_cell_text('a<br />b')).toBe('a\nb');
  });

  it('round-trips a multi-line model cell through escape then parse', () => {
    const model = 'first\nsecond\nthird';
    expect(parse_cell_text(escape_cell_text(model))).toBe(model);
  });

  it('round-trips a cell mixing escaped pipes and breaks at the source level', () => {
    const source = 'a \\| b<br>c \\| d';
    expect(escape_cell_text(parse_cell_text(source))).toBe(source);
  });
});

describe('TBL-SP-3 serialize_table — P3 column-uniform padding', () => {
  it('pads every cell in a column to the widest cell', () => {
    const out = lines(
      model([
        ['Header 1', 'h2'],
        ['x', 'wide content'],
      ]),
    );
    expect(out[0]).toBe('| Header 1 | h2           |');
    expect(out[2]).toBe('| x        | wide content |');
  });

  it('matches the delimiter row to the column width', () => {
    const out = lines(
      model([
        ['Header 1', 'h2'],
        ['x', 'wide content'],
      ]),
    );
    expect(out[1]).toBe('| -------- | ------------ |');
  });

  it('puts leading and trailing pipes on every row', () => {
    for (const line of lines(model([['a'], ['b'], ['c']]))) {
      expect(line.startsWith('| ')).toBe(true);
      expect(line.endsWith(' |')).toBe(true);
    }
  });

  it('floors column width at 3 even when all content is narrower', () => {
    const out = lines(model([['a'], ['b']]));
    expect(out[0]).toBe('| a   |');
    expect(out[1]).toBe('| --- |');
    expect(out[2]).toBe('| b   |');
  });

  it('measures width by source-byte length, not character count', () => {
    // 'née' is 3 chars but 4 UTF-8 bytes (é = 2 bytes); 'abc' is 3 bytes.
    // Byte-width 4 means 'abc' pads to 'abc ', while 'née' (already 4 bytes)
    // gets no trailing space — a char-count measure would pad them equally.
    const out = lines(model([['née'], ['abc']]));
    expect(out[0]).toBe('| née |');
    expect(out[1]).toBe('| ---- |');
    expect(out[2]).toBe('| abc  |');
  });

  it('measures the escaped form (escaped pipe widens the column)', () => {
    // 'a|b' escapes to 'a\\|b' = 4 bytes, wider than 'xyz' = 3.
    const out = lines(model([['a|b'], ['xyz']]));
    expect(out[0]).toBe('| a\\|b |');
    expect(out[1]).toBe('| ---- |');
    expect(out[2]).toBe('| xyz  |');
  });

  it('lets one widest cell drive padding for the rest of the column', () => {
    const out = lines(
      model([
        ['name', 'val'],
        ['short', 'a really wide cell'],
        ['x', 'y'],
      ]),
    );
    expect(out[0]).toBe('| name  | val                |');
    expect(out[2]).toBe('| short | a really wide cell |');
    expect(out[3]).toBe('| x     | y                  |');
  });
});

describe('TBL-SP-6 serialize_table — MC1 mismatched columns', () => {
  it('derives column count from the header row', () => {
    const out = lines(
      model([
        ['h1', 'h2', 'h3'],
        ['a', 'b'],
      ]),
    );
    for (const line of out) {
      expect(line.split('|').length).toBe(5);
    }
  });

  it('drops excess cells when a body row is longer than the header', () => {
    const out = lines(
      model([
        ['h1', 'h2'],
        ['aa', 'bb', 'cc', 'dd'],
      ]),
    );
    expect(out[2]).toBe('| aa  | bb  |');
    expect(out[2].split('|').length).toBe(4);
  });

  it('pads with empty cells when a body row is shorter than the header', () => {
    const out = lines(
      model([
        ['h1', 'h2', 'h3'],
        ['a'],
      ]),
    );
    expect(out[2]).toBe('| a   |     |     |');
  });

  it('normalizes a mix of long and short body rows to the header count', () => {
    const out = lines(
      model([
        ['h1', 'h2', 'h3'],
        ['a', 'b', 'c', 'd', 'e'],
        ['x'],
      ]),
    );
    expect(out[2]).toBe('| a   | b   | c   |');
    expect(out[3]).toBe('| x   |     |     |');
  });
});

describe('TBL-SP-3 serialize_table — alignment markers', () => {
  it('emits --- for null alignment', () => {
    expect(lines(model([['h']], [null]))[1]).toBe('| --- |');
  });

  it('emits :--- for left alignment', () => {
    expect(lines(model([['h']], ['left']))[1]).toBe('| :-- |');
  });

  it('emits ---: for right alignment', () => {
    expect(lines(model([['h']], ['right']))[1]).toBe('| --: |');
  });

  it('emits :-: for center alignment at minimum width', () => {
    expect(lines(model([['h']], ['center']))[1]).toBe('| :-: |');
  });

  it('widens left marker to the column P3 width', () => {
    const out = lines(model([['header text']], ['left']));
    expect(out[1]).toBe('| :---------- |');
  });

  it('widens right marker to the column P3 width', () => {
    const out = lines(model([['header text']], ['right']));
    expect(out[1]).toBe('| ----------: |');
  });

  it('widens center marker to the column P3 width', () => {
    const out = lines(model([['header text']], ['center']));
    expect(out[1]).toBe('| :---------: |');
  });

  it('emits independent markers per column', () => {
    const out = lines(
      model([['h1', 'h2', 'h3', 'h4']], ['left', 'center', 'right', null]),
    );
    expect(out[1]).toBe('| :-- | :-: | --: | --- |');
  });
});

describe('TBL-E-4 TBL-E-5 serialize_table — edge cases', () => {
  it('serializes a single-column table', () => {
    const out = lines(model([['only'], ['a'], ['b']]));
    expect(out).toEqual(['| only |', '| ---- |', '| a    |', '| b    |']);
  });

  it('serializes a single-row (header-only) table', () => {
    const out = lines(model([['h1', 'h2']]));
    expect(out).toEqual(['| h1  | h2  |', '| --- | --- |']);
  });

  it('serializes empty cells padded to the floor width', () => {
    const out = lines(
      model([
        ['', ''],
        ['', ''],
      ]),
    );
    expect(out).toEqual(['|     |     |', '| --- | --- |', '|     |     |']);
  });

  it('keeps an all-empty column at the floor width while a sibling column widens', () => {
    const out = lines(
      model([
        ['', 'header'],
        ['', 'body'],
      ]),
    );
    expect(out[0]).toBe('|     | header |');
    expect(out[2]).toBe('|     | body   |');
  });

  it('repads the whole column when one cell becomes the new widest', () => {
    const narrow = lines(
      model([
        ['h', 'h'],
        ['a', 'b'],
      ]),
    );
    expect(narrow[2]).toBe('| a   | b   |');

    const widened = lines(
      model([
        ['h', 'h'],
        ['a much wider cell', 'b'],
      ]),
    );
    expect(widened[0]).toBe('| h                 | h   |');
    expect(widened[2]).toBe('| a much wider cell | b   |');
  });

  it('escapes pipes inside cell content during serialize', () => {
    const out = lines(model([['a | b'], ['c']]));
    expect(out[0]).toBe('| a \\| b |');
  });

  it('converts internal newlines to <br> during serialize', () => {
    const out = lines(model([['line1\nline2'], ['x']]));
    expect(out[0]).toBe('| line1<br>line2 |');
  });
});

describe('TBL-SP-9 serialize_table — round-trip stability (AC6)', () => {
  it('is idempotent: serializing twice yields the same bytes', () => {
    const m = model(
      [
        ['Name', 'Value'],
        ['alpha', '1'],
        ['beta', '2'],
      ],
      ['left', 'right'],
    );
    const first = serialize_table(m);
    expect(serialize_table(m)).toBe(first);
  });

  it('reproduces a canonical P3-padded table verbatim', () => {
    const m = model(
      [
        ['Header 1', 'Header 2 long', 'h3'],
        ['short', 'wide_b', 'x'],
      ],
      ['left', 'right', null],
    );
    expect(serialize_table(m)).toBe(
      [
        '| Header 1 | Header 2 long | h3  |',
        '| :------- | ------------: | --- |',
        '| short    |        wide_b | x   |',
      ].join('\n'),
    );
  });

  it('canonical cell source round-trips through parse then escape', () => {
    const sources = ['plain', 'has \\| pipe', 'has<br>break', '`code \\| x`', '\\$5 each'];
    for (const src of sources) {
      expect(escape_cell_text(parse_cell_text(src))).toBe(src);
    }
  });
});
