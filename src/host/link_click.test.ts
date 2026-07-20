import { describe, it, expect } from 'vitest';
import { classify_link_click } from './link_click.js';

// Encodes the link-routing contract (editor-shell.md SHELL-M-3, links.md
// LINK-I-9 / LINK-I-12) against the vscode-free classifier extracted from
// provider.try_handle_link_click. The vscode wiring (openExternal / vscode.open)
// switches on the returned decision. Security intent (per the T3 brief, closed
// by ADR-0004): nothing user-controlled reaches openExternal unless its scheme
// is on the external allowlist; `file:` opens in-editor via vscode.open.

const WITH_DIR = { has_document_dir: true };
const NO_DIR = { has_document_dir: false };

describe('classify_link_click — empty/degenerate href LINK-I-9', () => {
  it('drops a missing or empty href before it can reach openExternal', () => {
    for (const href of ['', undefined, null, 0, false, {}, []]) {
      expect(classify_link_click(href, WITH_DIR)).toEqual({ kind: 'ignore-empty' });
    }
  });
});

describe('classify_link_click — fragments SHELL-M-3', () => {
  it('ignores a bare #fragment (in-document anchor), regardless of document dir', () => {
    for (const href of ['#', '#sec', '#a-b-c']) {
      expect(classify_link_click(href, WITH_DIR)).toEqual({ kind: 'ignore-fragment' });
      expect(classify_link_click(href, NO_DIR)).toEqual({ kind: 'ignore-fragment' });
    }
  });
});

describe('classify_link_click — allowlisted external schemes SHELL-M-3 LINK-I-12', () => {
  it('routes http/https/mailto/vscode/vscode-insiders to open-external, verbatim href', () => {
    for (const href of [
      'https://example.com/a?b=c#d',
      'http://example.com',
      'mailto:a@b.com',
      'vscode://extension/id',
      'vscode-insiders://extension/id',
    ]) {
      expect(classify_link_click(href, WITH_DIR)).toEqual({ kind: 'open-external', href });
    }
  });

  it('matches the allowlist case-insensitively but keeps the href verbatim', () => {
    const href = 'HTTPS://Example.com/Path';
    expect(classify_link_click(href, WITH_DIR)).toEqual({ kind: 'open-external', href });
  });

  it('scheme detection precedes the document-dir check (external opens even on untitled)', () => {
    expect(classify_link_click('https://example.com', NO_DIR)).toEqual({
      kind: 'open-external',
      href: 'https://example.com',
    });
  });
});

describe('classify_link_click — file: opens in-editor SHELL-M-3 ADR-0004', () => {
  it('routes file: to open-file (vscode.open), never open-external', () => {
    for (const href of ['file:///Users/me/x.md', 'FILE:///Users/me/x.md']) {
      expect(classify_link_click(href, WITH_DIR)).toEqual({ kind: 'open-file', href });
    }
  });

  it('file: routing does not depend on the document dir (absolute target)', () => {
    expect(classify_link_click('file:///a/b.md', NO_DIR)).toEqual({
      kind: 'open-file',
      href: 'file:///a/b.md',
    });
  });
});

describe('classify_link_click — document-relative hrefs SHELL-M-3 LINK-I-12', () => {
  it('routes relative paths to open-workspace-relative when the document has a dir', () => {
    for (const href of ['./doc.md', 'sub/dir.md', '../up.md', 'doc.md', 'a/b/c.md', 'img.png#frag']) {
      expect(classify_link_click(href, WITH_DIR)).toEqual({ kind: 'open-workspace-relative', href });
    }
  });

  it('drops a relative href on a parentless (untitled) document — never resolved, never opened', () => {
    for (const href of ['./doc.md', 'sub/dir.md', 'doc.md']) {
      expect(classify_link_click(href, NO_DIR)).toEqual({ kind: 'noop-untitled', href });
    }
  });
});

// Off-allowlist schemes are dropped outright (SHELL-M-3 / ADR-0004): VS Code's
// trusted-domains prompt gates only http/https, so any other scheme handed to
// openExternal would reach the OS shell handler unchecked (javascript:, data:,
// the Joplin CVE-2022-40277 .desktop vector, UNC credential leaks, …).
describe('classify_link_click — off-allowlist schemes are blocked SHELL-M-3 ADR-0004', () => {
  it('drops javascript:/data:/vbscript:/command: with the offending scheme reported', () => {
    for (const [href, scheme] of [
      ['javascript:alert(1)', 'javascript'],
      ['data:text/html,<script>alert(1)</script>', 'data'],
      ['vbscript:msgbox(1)', 'vbscript'],
      ['command:workbench.action.terminal.new', 'command'],
      ['sftp://evil.example/share/payload.desktop', 'sftp'],
    ] as const) {
      expect(classify_link_click(href, WITH_DIR)).toEqual({ kind: 'blocked-scheme', href, scheme });
    }
  });

  it('blocks case-variant spellings (scheme comparison is lowercased)', () => {
    expect(classify_link_click('JAVASCRIPT:alert(1)', WITH_DIR)).toEqual({
      kind: 'blocked-scheme',
      href: 'JAVASCRIPT:alert(1)',
      scheme: 'javascript',
    });
  });

  it('a bare Windows drive path (C:\\...) is scheme-shaped and lands on blocked, not external', () => {
    // Edge case: `c:` satisfies the RFC-3986 scheme shape; under the allowlist it
    // is dropped instead of being handed to openExternal.
    const href = 'C:\\Users\\me\\x.md';
    expect(classify_link_click(href, WITH_DIR)).toEqual({
      kind: 'blocked-scheme',
      href,
      scheme: 'c',
    });
  });

  it('blocking precedes the document-dir check (dropped on untitled too)', () => {
    expect(classify_link_click('javascript:alert(1)', NO_DIR)).toEqual({
      kind: 'blocked-scheme',
      href: 'javascript:alert(1)',
      scheme: 'javascript',
    });
  });
});

// The following adversarial inputs are the safe (fail-safe) side of the routing:
// they are NOT recognized as external schemes, so they fall through to
// workspace-relative resolution (joinPath against the document dir) and can
// never reach openExternal. Behavior differs from a browser (which strips
// leading whitespace/controls before scheme detection), but errs safe.
describe('classify_link_click — adversarial inputs that correctly stay off openExternal', () => {
  it('protocol-relative //host is treated as a relative path, not an external URL', () => {
    expect(classify_link_click('//evil.example', WITH_DIR)).toEqual({
      kind: 'open-workspace-relative',
      href: '//evil.example',
    });
  });

  it('whitespace/control-char-prefixed schemes are not treated as schemes (stay relative)', () => {
    const space = ' javascript:alert(1)';
    const tab = String.fromCharCode(9) + 'javascript:alert(1)';
    const newline = String.fromCharCode(10) + 'https://evil.example';
    const control = String.fromCharCode(1) + 'javascript:alert(1)';
    for (const href of [space, tab, newline, control]) {
      expect(classify_link_click(href, WITH_DIR)).toEqual({ kind: 'open-workspace-relative', href });
    }
  });
});
