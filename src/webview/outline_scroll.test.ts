import { describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';
import { position_to_offset } from './outline_scroll.js';

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
});
