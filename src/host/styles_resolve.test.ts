import { describe, expect, it } from 'vitest';
import { classify_style_entry } from './styles_resolve.js';

describe('classify_style_entry THEME-R-2', () => {
  it('flags non-string as invalid', () => {
    expect(classify_style_entry(undefined).kind).toBe('invalid');
    expect(classify_style_entry(null).kind).toBe('invalid');
    expect(classify_style_entry(42).kind).toBe('invalid');
    expect(classify_style_entry({}).kind).toBe('invalid');
  });

  it('flags empty string as invalid', () => {
    const r = classify_style_entry('');
    expect(r.kind).toBe('invalid');
    expect(r.kind === 'invalid' && r.reason).toBe('empty string');
  });

  it('declines http: and https: (any case)', () => {
    for (const entry of [
      'http://example.com/x.css',
      'https://example.com/x.css',
      'HTTPS://example.com/x.css',
      'Http://example.com/x.css',
    ]) {
      expect(classify_style_entry(entry).kind).toBe('declined_remote');
    }
  });

  it('recognizes file: URIs (any case)', () => {
    for (const entry of [
      'file:///Users/me/x.css',
      'file:///c:/foo/x.css',
      'FILE:///Users/me/x.css',
    ]) {
      expect(classify_style_entry(entry).kind).toBe('file_uri');
    }
  });

  it('recognizes POSIX absolute paths', () => {
    expect(classify_style_entry('/Users/me/x.css').kind).toBe('absolute_path');
    expect(classify_style_entry('/etc/foo/x.css').kind).toBe('absolute_path');
  });

  it('recognizes Windows absolute paths (forward and backward slashes)', () => {
    expect(classify_style_entry('C:\\Users\\me\\x.css').kind).toBe('absolute_path');
    expect(classify_style_entry('c:/Users/me/x.css').kind).toBe('absolute_path');
    expect(classify_style_entry('D:\\foo.css').kind).toBe('absolute_path');
  });

  it('treats everything else as relative path', () => {
    for (const entry of [
      'foo.css',
      './foo.css',
      '../foo.css',
      '.vscode/plainmark.css',
      'styles/x.css',
    ]) {
      expect(classify_style_entry(entry).kind).toBe('relative_path');
    }
  });

  it('does not classify ftp: or other schemes as remote (treats as relative — caller will fail to resolve)', () => {
    // v1 doesn't ship ftp:/data: support; classifier doesn't pre-screen them.
    // The host resolver will treat them as a relative path and produce a
    // workspace-joined URI that almost certainly won't load — acceptable v1.
    expect(classify_style_entry('ftp://example.com/x.css').kind).toBe('relative_path');
  });
});
