import { describe, it, expect } from 'vitest';
import { build_webview_html, escape_attribute, getNonce, type WebviewHtmlInput } from './webview_html.js';
import type { ResolvedTableKeybindings } from '../common/table_keybindings.js';

// These tests encode the webview-scaffold security contract (editor-shell.md
// SHELL-W-*) against the vscode-free string builder. They exercise the CSP
// directives, the per-render nonce placement, the user-`<link>` attribute
// escaping (SHELL-W-10), and the `</script>` neutralization of the inline
// keybindings JSON — the surface that shipped with zero unit coverage. The
// module is a pure extraction of provider.getHtml (INV-HOST-1), proven
// byte-identical to the previous inline template.

const NONCE = 'a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4';
const CSP = 'vscode-webview://csp-src-token';
const SCRIPT = 'https://uuid.vscode-webview.net/dist/webview.js';
const MJ = 'https://uuid.vscode-webview.net/dist/mathjax.js';
const MM = 'https://uuid.vscode-webview.net/dist/mermaid.js';
const FONTS = 'https://uuid.vscode-webview.net/dist/fonts/';

function html(
  o: Partial<Omit<WebviewHtmlInput, 'keybindings'>> & { keybindings?: unknown } = {},
): string {
  const { keybindings = {}, ...rest } = o;
  return build_webview_html({
    nonce: NONCE,
    cspSource: CSP,
    scriptUri: SCRIPT,
    mathjaxUri: MJ,
    mermaidUri: MM,
    fontsBase: FONTS,
    themeId: 'default',
    themeCss: '',
    styleHrefs: [],
    ...rest,
    keybindings: keybindings as ResolvedTableKeybindings,
  });
}

// Parse the CSP <meta> content into a directive → tokens map.
function csp_directives(out: string): Record<string, string[]> {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(out);
  if (!m) throw new Error('no CSP meta found');
  const map: Record<string, string[]> = {};
  for (const directive of m[1].split('; ')) {
    const [name, ...values] = directive.split(' ');
    map[name] = values;
  }
  return map;
}

function tags(out: string, name: 'script' | 'style' | 'link'): string[] {
  return out.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];
}

describe('build_webview_html CSP SHELL-W-2 SHELL-W-3 SHELL-W-5', () => {
  it('SHELL-W-2: default-src is exactly \'none\'', () => {
    expect(csp_directives(html())['default-src']).toEqual(["'none'"]);
  });

  it('SHELL-W-3: script-src is restricted to the per-render nonce — no unsafe-inline, no host source, no wildcard', () => {
    const d = csp_directives(html());
    expect(d['script-src']).toEqual([`'nonce-${NONCE}'`]);
    expect(d['script-src']).not.toContain("'unsafe-inline'");
    expect(d['script-src']).not.toContain("'unsafe-eval'");
    expect(d['script-src']).not.toContain(CSP);
    expect(d['script-src']).not.toContain('*');
  });

  it('SHELL-W-5: style-src permits unsafe-inline + cspSource only (no remote http/https stylesheets)', () => {
    const d = csp_directives(html());
    expect(d['style-src']).toEqual(["'unsafe-inline'", CSP]);
    expect(d['style-src']).not.toContain('https:');
    expect(d['style-src']).not.toContain('http:');
    expect(d['style-src']).not.toContain('*');
  });

  it('SHELL-W-5: img-src permits cspSource + https: only (no data:, no wildcard, no unsafe-inline)', () => {
    const d = csp_directives(html());
    expect(d['img-src']).toEqual([CSP, 'https:']);
    expect(d['img-src']).not.toContain('data:');
    expect(d['img-src']).not.toContain('*');
    expect(d['img-src']).not.toContain("'unsafe-inline'");
  });

  it('SHELL-W-5: font-src permits cspSource only', () => {
    const d = csp_directives(html());
    expect(d['font-src']).toEqual([CSP]);
    expect(d['font-src']).not.toContain('https:');
    expect(d['font-src']).not.toContain('data:');
  });

  it('SHELL-W-2: no directive is a bare wildcard and unsafe-eval never appears', () => {
    const raw = /content="([^"]*)"/.exec(html())?.[1] ?? '';
    expect(raw).not.toContain('unsafe-eval');
    for (const values of Object.values(csp_directives(html()))) {
      expect(values).not.toContain('*');
    }
  });
});

describe('getNonce + nonce placement SHELL-W-3 SHELL-W-4', () => {
  it('SHELL-W-4: getNonce returns 32 hex chars (16 bytes / 128 bits of Web-Crypto entropy)', () => {
    for (let i = 0; i < 50; i++) {
      expect(getNonce()).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('SHELL-W-4: nonces are unique per call (fresh nonce every getHtml)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(getNonce());
    expect(seen.size).toBe(500);
  });

  it('SHELL-W-3: the CSP script-src nonce equals the nonce on every <script> tag', () => {
    const out = html({ themeCss: 'body{color:red}' });
    const script_tags = tags(out, 'script');
    // 5 inline bootstrap scripts + 1 external src script.
    expect(script_tags).toHaveLength(6);
    for (const tag of script_tags) {
      expect(tag).toContain(`nonce="${NONCE}"`);
    }
    expect(csp_directives(out)['script-src']).toEqual([`'nonce-${NONCE}'`]);
  });

  it('SHELL-W-3: every <style> tag (root defaults + active theme) carries the nonce', () => {
    const out = html({ themeCss: 'body{color:red}' });
    const style_tags = tags(out, 'style');
    expect(style_tags).toHaveLength(2);
    for (const tag of style_tags) expect(tag).toContain(`nonce="${NONCE}"`);
  });

  it('SHELL-W-8: the mathjax-font and mermaid bootstrap globals precede the main webview <script src>', () => {
    const out = html();
    const mathjax_font = out.indexOf('window.__mathjax_font_url');
    const mermaid = out.indexOf('window.__plainmark_mermaid');
    const main_script = out.indexOf(`src="${SCRIPT}"`);
    expect(mathjax_font).toBeGreaterThan(-1);
    expect(mermaid).toBeGreaterThan(-1);
    expect(mathjax_font).toBeLessThan(main_script);
    expect(mermaid).toBeLessThan(main_script);
  });
});

describe('scaffold structure SHELL-W-1 SHELL-W-9', () => {
  it('SHELL-W-1: exactly one editor mount point', () => {
    expect(html().match(/<div id="editor">/g)).toHaveLength(1);
  });

  it('SHELL-W-9: cascade order — :root defaults <style> → theme <style> → user <link> → scripts', () => {
    const out = html({ themeCss: 'body{color:red}', styleHrefs: ['user.css'] });
    const root_style = out.indexOf('<style'); // :root defaults come first
    const theme_style = out.indexOf('body{color:red}');
    const user_link = out.indexOf('<link');
    const first_script = out.indexOf('<script');
    expect(root_style).toBeLessThan(theme_style);
    expect(theme_style).toBeLessThan(user_link);
    expect(user_link).toBeLessThan(first_script);
  });

  it('omits the theme <style> block when the theme CSS is empty (adaptive default)', () => {
    expect(tags(html({ themeCss: '' }), 'style')).toHaveLength(1);
  });
});

describe('escape_attribute SHELL-W-10', () => {
  it('escapes the attribute-breakout characters &, ", <', () => {
    expect(escape_attribute('"')).toBe('&quot;');
    expect(escape_attribute('<')).toBe('&lt;');
    expect(escape_attribute('&')).toBe('&amp;');
  });

  it('escapes & FIRST so entities are not double-mangled', () => {
    // If & were escaped after ", the ampersand of &quot; would be re-escaped.
    expect(escape_attribute('"')).toBe('&quot;');
    expect(escape_attribute('&amp;')).toBe('&amp;amp;');
    expect(escape_attribute('a & b < c "d"')).toBe('a &amp; b &lt; c &quot;d&quot;');
  });

  it('leaves characters that cannot break a double-quoted attribute untouched (\', >, unicode)', () => {
    // Single-quote and > are inert inside a double-quoted attribute; a literal
    // " sequence is inert text, not an actual quote.
    expect(escape_attribute("'")).toBe("'");
    expect(escape_attribute('>')).toBe('>');
    expect(escape_attribute('café — π')).toBe('café — π');
    expect(escape_attribute('\\u0022')).toBe('\\u0022');
  });
});

describe('user <link> href injection is neutralized SHELL-W-10', () => {
  it('a style href cannot break out of its attribute or inject a live <script>', () => {
    const out = html({ styleHrefs: ['"><script>alert(1)</script>'] });
    // No attribute breakout, no injected script element.
    expect(out).not.toContain('"><script');
    expect(out).not.toContain('<script>alert(1)');
    expect(tags(out, 'script')).toHaveLength(6); // still only the 6 legitimate scripts
    // The dangerous characters survive as escaped entities inside the attribute.
    expect(out).toContain('&quot;');
    expect(out).toContain('&lt;script');
  });

  it('quotes, ampersands, and pseudo-unicode-escapes in a href are escaped in both emitted attributes', () => {
    const out = html({ styleHrefs: ['x&y"z<\\u0041.css'] });
    const escaped = 'x&amp;y&quot;z&lt;\\u0041.css';
    // Appears in href="…" and data-plainmark-style="…".
    expect(out.match(new RegExp(escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(2);
    expect(out).not.toContain('y"z'); // raw quote never survives
  });
});

describe('inline keybindings JSON is </script>-neutralized SHELL-W-10', () => {
  it('a keybinding value containing </script><script> cannot terminate the inline script', () => {
    const out = html({
      keybindings: { insert_row_above: '</script><script>alert(1)</script>' },
    });
    // No breakout: no raw </script> from user input, no injected <script>.
    expect(out).not.toContain('</script><script>');
    expect(out).not.toContain('<script>alert(1)');
    expect(tags(out, 'script')).toHaveLength(6);
    expect(out.match(/<\/script>/g)).toHaveLength(6); // only the 6 legitimate closers
    // The value survives as <-escaped JSON, decoded to the real string at runtime.
    expect(out).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
  });

  it('every < in the keybindings block is neutralized — comment and script-open vectors too', () => {
    const out = html({ keybindings: { insert_row_above: '<!--<script<x' } });
    expect(out).toContain('\\u003c!--\\u003cscript\\u003cx');
    expect(out).not.toContain('<!--<script');
  });

  it('quotes are JSON-escaped and ampersands pass through raw (inert in a raw-text <script>)', () => {
    const out = html({ keybindings: { insert_row_above: 'a"b&c' } });
    // JSON.stringify escapes the quote; & is inert inside a <script> raw-text element.
    expect(out).toContain('"insert_row_above":"a\\"b&c"');
  });
});
