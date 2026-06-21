import { describe, it, expect } from 'vitest';
import { lf_to_native, native_to_lf } from './translate.js';

describe('native_to_lf SYNC-H-3', () => {
  it('returns LF-only text unchanged', () => {
    expect(native_to_lf('a\nb\nc')).toBe('a\nb\nc');
  });

  it('normalizes CRLF to LF', () => {
    expect(native_to_lf('a\r\nb\r\nc')).toBe('a\nb\nc');
  });

  it('handles mixed CRLF and LF', () => {
    expect(native_to_lf('a\r\nb\nc\r\n')).toBe('a\nb\nc\n');
  });

  // FIX-5 (review 2026-06-10): lone CR is normalized at the host boundary —
  // CM6 normalizes it anyway, and keeping it host-side made the LF views
  // diverge so the first keystroke rewrote EOLs as an UNDECLARED whole-doc
  // diff. Now declared: legacy classic-Mac EOLs normalize on first edit.
  it('normalizes lone CR (classic-Mac EOL) to LF', () => {
    expect(native_to_lf('a\rb\rc')).toBe('a\nb\nc');
  });

  it('handles mixed CRLF, lone CR, and LF', () => {
    expect(native_to_lf('a\r\nb\rc\nd\r')).toBe('a\nb\nc\nd\n');
  });

  it('never emits a CR (matches CM6 DefaultSplit semantics)', () => {
    expect(native_to_lf('\r\r\n\n\r')).not.toContain('\r');
  });

  it('empty string passes through', () => {
    expect(native_to_lf('')).toBe('');
  });
});

describe('lf_to_native', () => {
  it('LF EOL: returns text unchanged', () => {
    expect(lf_to_native('a\nb', '\n')).toBe('a\nb');
  });

  it('CRLF EOL: expands \\n to \\r\\n', () => {
    expect(lf_to_native('a\nb', '\r\n')).toBe('a\r\nb');
  });

  it('CRLF EOL: text without newlines is unchanged', () => {
    expect(lf_to_native('hello', '\r\n')).toBe('hello');
  });

  it('CRLF EOL: multiple newlines', () => {
    expect(lf_to_native('a\nb\nc', '\r\n')).toBe('a\r\nb\r\nc');
  });
});
