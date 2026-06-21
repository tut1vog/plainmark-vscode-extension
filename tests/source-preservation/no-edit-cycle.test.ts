import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { create_sync_loop } from '../../src/sync/loop.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const noEditDir = join(__dirname, 'fixtures/no-edit');
const tablesDir = join(__dirname, 'fixtures/tables');
const codeBlocksDir = join(__dirname, 'fixtures/code-blocks');
const frontmatterDir = join(__dirname, 'fixtures/frontmatter');
const htmlBlocksDir = join(__dirname, 'fixtures/html-blocks');

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

describe('INV-SP-4 INV-SP-1: no-edit cycle: opening with no user input emits no WorkspaceEdit', () => {
  for (const { name, path } of fixtures) {
    it(name, async () => {
      const inputBytes = readFileSync(path);
      const text = inputBytes.toString('utf8');

      const posted: unknown[] = [];
      const applies: { uri_string: string; text: string }[] = [];
      const loop = create_sync_loop(
        {
          uri_string: 'file://' + path,
          get_text: () => text,
          get_version: () => 1,
          get_document_dir_webview_uri: () => null,
        },
        { post_message: (m) => posted.push(m) },
        {
          apply_full_replace: async (uri_string, lf_text) => {
            applies.push({ uri_string, text: lf_text });
            return true;
          },
        },
      );

      // Webview boots and signals ready; host replies with sync. No edits should result.
      await loop.handle_webview_message({ type: 'ready' });

      expect(applies).toEqual([]);
      expect(posted).toEqual([
        { type: 'sync', text, version: 1, document_dir_webview_uri: null },
      ]);
      // The text the loop reports as authoritative is byte-identical to the input file.
      expect(Buffer.from(text, 'utf8')).toEqual(inputBytes);
    });
  }
});
