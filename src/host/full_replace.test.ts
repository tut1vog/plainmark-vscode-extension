import { describe, it, expect } from 'vitest';
import { plan_full_replace, type FullReplacePlan, type FullReplaceTarget } from './full_replace.js';
import { native_to_lf } from '../sync/translate.js';

const URI = 'file:///doc.md';

// Derive the TextDocument-shaped fields (line_count, last_line_length) from a
// native text with a uniform EOL — mirrors what vscode's TextDocument exposes.
function target_from_native(native: string, eol: '\r\n' | '\n'): FullReplaceTarget {
  const lines = native.split(eol);
  return {
    uri: URI,
    eol,
    line_count: lines.length,
    last_line_length: lines[lines.length - 1].length,
  };
}

// Independently map a (line, character) position back to a byte offset in the
// native text, so range assertions test the CONTRACT ("spans the whole
// document") rather than echoing the implementation's arithmetic.
function offset_at(
  native: string,
  eol: '\r\n' | '\n',
  pos: { line: number; character: number },
): number {
  const lines = native.split(eol);
  let off = 0;
  for (let i = 0; i < pos.line; i++) off += lines[i].length + eol.length;
  return off + pos.character;
}

function expect_replace(plan: FullReplacePlan): Extract<FullReplacePlan, { kind: 'replace' }> {
  if (plan.kind !== 'replace') throw new Error(`expected a replace plan, got "${plan.kind}"`);
  return plan;
}

describe('plan_full_replace — EOL translation SYNC-W-3 INV-SP-3 SYNC-P-6', () => {
  it('LF document: the webview LF text passes through unchanged', () => {
    const plan = expect_replace(plan_full_replace(target_from_native('a\nb', '\n'), URI, 'a\nb\nc'));
    expect(plan.text).toBe('a\nb\nc');
  });

  it('CRLF document: every LF becomes CRLF (SYNC-W-3 example)', () => {
    const plan = expect_replace(plan_full_replace(target_from_native('a\r\nb', '\r\n'), URI, 'a\nb'));
    expect(plan.text).toBe('a\r\nb');
  });

  it('CRLF document: a run of LFs each expand to CRLF', () => {
    const plan = expect_replace(
      plan_full_replace(target_from_native('x\r\n', '\r\n'), URI, 'a\nb\nc'),
    );
    expect(plan.text).toBe('a\r\nb\r\nc');
  });

  it('lone `\\r` in the LF text is left untouched (translate module outbound policy)', () => {
    // The webview never emits a lone `\r` (CM6's doc is LF); it is `native_to_lf`
    // on the INBOUND side that normalizes legacy classic-Mac EOLs. The outbound
    // `lf_to_native` this path uses only expands `\n`, so a stray `\r` survives.
    expect(
      expect_replace(plan_full_replace(target_from_native('x\r\n', '\r\n'), URI, 'a\rb\nc')).text,
    ).toBe('a\rb\r\nc');
    expect(
      expect_replace(plan_full_replace(target_from_native('x\n', '\n'), URI, 'a\rb\nc')).text,
    ).toBe('a\rb\nc');
  });

  it('CRLF no-input echo round-trips byte-identically (INV-SP-4)', () => {
    // A CRLF document with no trailing newline. The webview holds its LF view;
    // echoing that back with no user input must reconstruct the original bytes.
    const native = '# Title\r\nline two\r\n\r\npara\r\nlast';
    const lf_view = native_to_lf(native); // what CM6 would hold
    const plan = expect_replace(plan_full_replace(target_from_native(native, '\r\n'), URI, lf_view));
    expect(plan.text).toBe(native);
  });

  it('LF no-input echo round-trips byte-identically (INV-SP-4)', () => {
    const native = '# Title\nline two\n\npara\nlast';
    const plan = expect_replace(
      plan_full_replace(target_from_native(native, '\n'), URI, native_to_lf(native)),
    );
    expect(plan.text).toBe(native);
  });
});

describe('plan_full_replace — whole-document replace range SYNC-W-3', () => {
  // Each case: the range must start at offset 0 and end at the native length, so
  // it covers exactly the whole document. offset_at() re-derives offsets from
  // the text, catching any off-by-one in the line/character arithmetic.
  const cases: Array<{ name: string; native: string; eol: '\r\n' | '\n' }> = [
    { name: 'empty document', native: '', eol: '\n' },
    { name: 'single line, no newline', native: 'hello', eol: '\n' },
    { name: 'multi-line, no trailing newline', native: 'a\nb\nc', eol: '\n' },
    { name: 'multi-line, trailing newline', native: 'a\nb\n', eol: '\n' },
    { name: 'CRLF, no trailing newline', native: 'a\r\nb', eol: '\r\n' },
    { name: 'CRLF, trailing newline', native: 'a\r\nb\r\n', eol: '\r\n' },
  ];

  for (const { name, native, eol } of cases) {
    it(`${name}: range covers exactly [0, length]`, () => {
      const plan = expect_replace(plan_full_replace(target_from_native(native, eol), URI, 'new'));
      expect(offset_at(native, eol, plan.start)).toBe(0);
      expect(offset_at(native, eol, plan.end)).toBe(native.length);
    });
  }

  it('start is always (0,0)', () => {
    const plan = expect_replace(plan_full_replace(target_from_native('a\nb\n', '\n'), URI, 'x'));
    expect(plan.start).toEqual({ line: 0, character: 0 });
  });

  it('end of a trailing-newline document is (lastLine, 0), not the prior line end', () => {
    // Guards against an off-by-one that would land the end on the penultimate
    // line and drop the final empty line from the replaced range.
    const plan = expect_replace(plan_full_replace(target_from_native('a\nb\n', '\n'), URI, 'x'));
    expect(plan.end).toEqual({ line: 2, character: 0 });
  });
});

describe('plan_full_replace — URI guard SYNC-W-4', () => {
  it('a target URI matching the bound document yields a replace plan', () => {
    const plan = plan_full_replace(target_from_native('a\nb', '\n'), URI, 'x');
    expect(plan.kind).toBe('replace');
  });

  it('a target URI other than the bound document is skipped (no edit)', () => {
    const plan = plan_full_replace(target_from_native('a\nb', '\n'), 'file:///other.md', 'x');
    expect(plan).toEqual({ kind: 'skip' });
  });
});
