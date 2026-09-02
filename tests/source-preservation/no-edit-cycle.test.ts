import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { create_sync_loop } from '../../src/sync/loop.js';
import { lf_to_native, native_to_lf } from '../../src/sync/translate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const noEditDir = join(__dirname, 'fixtures/no-edit');
const tablesDir = join(__dirname, 'fixtures/tables');
const codeBlocksDir = join(__dirname, 'fixtures/code-blocks');
const frontmatterDir = join(__dirname, 'fixtures/frontmatter');
const htmlBlocksDir = join(__dirname, 'fixtures/html-blocks');

// Every fixture is committed LF-terminated; the variants derive the CRLF and
// no-trailing-newline shapes a real file can have.
const fixtures: Array<{ name: string; path: string }> = [
  { name: 'short', path: join(noEditDir, 'short.md') },
  { name: 'all-inline', path: join(noEditDir, 'all-inline.md') },
  { name: 'frontmatter-code', path: join(noEditDir, 'frontmatter-code.md') },
  { name: 'large (~1MB)', path: join(noEditDir, 'large.md') },
  { name: 'table', path: join(tablesDir, 'table.md') },
  { name: 'code-blocks', path: join(codeBlocksDir, 'basic.md') },
  { name: 'frontmatter-sample', path: join(frontmatterDir, 'sample.md') },
  { name: 'frontmatter-dot-closer', path: join(frontmatterDir, 'dot-closer.md') },
  { name: 'html-blocks-block', path: join(htmlBlocksDir, 'block.md') },
  { name: 'html-blocks-inline', path: join(htmlBlocksDir, 'inline.md') },
];

interface Variant {
  label: string;
  eol: '\n' | '\r\n';
  to_native: (lf: string) => string;
}

const variants: Variant[] = [
  { label: 'LF', eol: '\n', to_native: (t) => t },
  { label: 'CRLF', eol: '\r\n', to_native: (t) => t.replace(/\n/g, '\r\n') },
  { label: 'LF, no trailing newline', eol: '\n', to_native: (t) => t.replace(/\n$/, '') },
  {
    label: 'CRLF, no trailing newline',
    eol: '\r\n',
    to_native: (t) => t.replace(/\n$/, '').replace(/\n/g, '\r\n'),
  },
];

// CM6's Text.of splits on /\r\n?|\n/ and joins with '\n' — the webview doc is
// always the LF-normalized form of whatever the sync carried.
function cm6_normalize(text: string): string {
  return text.split(/\r\n?|\n/).join('\n');
}

// A host whose TextDocument holds `native` bytes with the given EOL, wired to
// the production loop exactly as provider.ts wires it (LF at the boundary).
function make_host(initial_native: string, eol: '\r\n' | '\n') {
  let native = initial_native;
  let version = 1;
  const posted: Array<{ type: string; text: string; version: number }> = [];
  const applies: string[] = [];
  const loop = create_sync_loop(
    {
      uri_string: 'file:///doc.md',
      get_text: () => native_to_lf(native),
      get_version: () => version,
      get_document_dir_webview_uri: () => null,
    },
    { post_message: (m) => posted.push(m as { type: string; text: string; version: number }) },
    {
      apply_full_replace: async (_uri, lf_text) => {
        native = lf_to_native(lf_text, eol);
        version++;
        applies.push(native);
        return true;
      },
    },
  );
  return { loop, posted, applies, native: () => native };
}

beforeEach(() => {
  const original_log = console.log;
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0] === '[sync]') return;
    original_log.apply(console, args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('INV-SP-4 INV-SP-1 SYNC-H-3: no-edit cycle — open, ready, and the webview echo apply nothing', () => {
  for (const { name, path } of fixtures) {
    for (const variant of variants) {
      it(`${name} (${variant.label})`, async () => {
        const native = variant.to_native(readFileSync(path, 'utf8'));
        const h = make_host(native, variant.eol);

        await h.loop.handle_webview_message({ type: 'ready' });
        expect(h.posted).toEqual([
          { type: 'sync', text: native_to_lf(native), version: 1, document_dir_webview_uri: null },
        ]);
        const seed = h.posted[0].text;
        expect(seed).not.toContain('\r');

        // The webview's CM6 doc is the normalized seed; with no user input its
        // echo `update` must land as a no-op — no WorkspaceEdit, bytes untouched.
        const webview_doc = cm6_normalize(seed);
        expect(webview_doc).toBe(seed);
        await h.loop.handle_webview_message({ type: 'update', text: webview_doc, base_version: 1 });

        expect(h.applies).toEqual([]);
        expect(h.native()).toBe(native);
        // And the bytes a first real edit would write back for this doc are the input bytes.
        expect(lf_to_native(webview_doc, variant.eol)).toBe(native);
      });
    }
  }
});
