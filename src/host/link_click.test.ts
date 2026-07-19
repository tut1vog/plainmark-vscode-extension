import { describe, it, expect } from 'vitest';
import { classify_link_click } from './link_click.js';

// Encodes the link-routing contract (editor-shell.md SHELL-M-3, links.md
// LINK-I-9 / LINK-I-12) against the vscode-free classifier extracted from
// provider.try_handle_link_click. The vscode wiring (openExternal / vscode.open)
// switches on the returned decision. Security intent (per the T3 brief): nothing
// user-controlled should reach openExternal unless it is a genuine external URL.

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

describe('classify_link_click — genuine external schemes SHELL-M-3 LINK-I-12', () => {
  it('routes http/https/mailto/file/vscode schemes to open-external, verbatim href', () => {
    for (const href of [
      'https://example.com/a?b=c#d',
      'http://example.com',
      'mailto:a@b.com',
      'file:///Users/me/x.md',
      'vscode://extension/id',
    ]) {
      expect(classify_link_click(href, WITH_DIR)).toEqual({ kind: 'open-external', href });
    }
  });

  it('scheme detection precedes the document-dir check (external opens even on untitled)', () => {
    expect(classify_link_click('https://example.com', NO_DIR)).toEqual({
      kind: 'open-external',
      href: 'https://example.com',
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

// FINDINGS (reported, not endorsed): the scheme regex is an allowlist-free
// matcher, so ANY well-formed scheme — including dangerous non-navigational ones
// — routes to open-external and is handed to vscode.env.openExternal. Per the
// security intent this should be gated by a scheme allowlist. These assertions
// characterize CURRENT behavior so a future hardening fix deliberately trips
// them; see the T3 report. VS Code's own openExternal handling bounds
// exploitability, but there is no allowlist at this layer.
describe('classify_link_click — FINDING: dangerous schemes reach open-external (no allowlist)', () => {
  it('javascript:/data:/vbscript: are forwarded to open-external instead of being blocked', () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ]) {
      // SECURITY INTENT: should be dropped. CURRENT: routed to openExternal.
      expect(classify_link_click(href, WITH_DIR)).toEqual({ kind: 'open-external', href });
    }
  });

  it('a bare Windows drive path (C:\\...) matches the scheme regex and routes external', () => {
    // Edge case: `c:` satisfies the RFC-3986 scheme shape, so a drive-letter path
    // is classified as external rather than workspace-relative.
    const href = 'C:\\Users\\me\\x.md';
    expect(classify_link_click(href, WITH_DIR)).toEqual({ kind: 'open-external', href });
  });
});
