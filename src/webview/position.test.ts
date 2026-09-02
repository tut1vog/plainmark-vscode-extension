import { describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';
import { position_to_offset } from './position.js';

describe('position_to_offset OUT-I-2', () => {
  const lf_text = '# A\nbody one\nbody two\n## B\nafter\n';
  const doc = Text.of(lf_text.split('\n'));

  it('lands on the heading start in an LF doc given {line, character}', () => {
    expect(position_to_offset(doc, 3, 0)).toBe(lf_text.indexOf('## B'));
    expect(position_to_offset(doc, 0, 2)).toBe(2);
  });

  it('agrees with the LF doc for positions sourced from a CRLF host document', () => {
    const crlf_text = '# A\r\nbody one\r\nbody two\r\n## B\r\nafter\r\n';
    const b_line = crlf_text.split('\r\n').indexOf('## B');
    expect(position_to_offset(doc, b_line, 0)).toBe(lf_text.indexOf('## B'));
  });

  it('clamps line and character into the document', () => {
    expect(position_to_offset(doc, doc.lines + 5, 0)).toBe(doc.length);
    expect(position_to_offset(doc, -1, 0)).toBe(0);
    // line 3 is '## B' (length 4): character past line end clamps to line end.
    expect(position_to_offset(doc, 3, 99)).toBe(lf_text.indexOf('## B') + 4);
    expect(position_to_offset(doc, 3, -7)).toBe(lf_text.indexOf('## B'));
  });

  it('returns 0 on an empty doc regardless of position', () => {
    expect(position_to_offset(Text.of(['']), 5, 5)).toBe(0);
  });

  it('counts astral characters as two UTF-16 units, matching the host column', () => {
    // VS Code `character` and CM6 offsets both count UTF-16 code units, so a
    // surrogate pair (😀, 𠮷) advances by 2 and a column may land mid-pair.
    const text = '😀a𠮷\n𝒳b';
    const astral = Text.of(text.split('\n'));
    expect(position_to_offset(astral, 0, 1)).toBe(1);
    expect(position_to_offset(astral, 0, 2)).toBe(2);
    expect(position_to_offset(astral, 0, 3)).toBe(3);
    expect(position_to_offset(astral, 0, 5)).toBe(5);
    expect(position_to_offset(astral, 0, 99)).toBe(5);
    expect(position_to_offset(astral, 1, 2)).toBe(8);
    expect(text.slice(position_to_offset(astral, 1, 2))).toBe('b');
  });
});
