// Lone-`\r` (classic-Mac) EOLs and INV-SP-1 scope.
// Before the fix, `native_to_lf` kept lone `\r` while CM6 normalized it, so
// the host and webview LF views diverged on open and the FIRST keystroke
// rewrote every EOL file-wide as an undeclared whole-doc diff. The declared
// behavior is:
//   1. open + no input → zero WorkspaceEdits (INV-SP-4 holds for `\r` files);
//   2. the first real edit normalizes legacy lone-`\r` EOLs file-wide
//      (to the document's native EOL); INV-SP-1 is scoped to `\n`/`\r\n` files.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { create_sync_loop } from '../../../src/sync/loop.js';
import { lf_to_native, native_to_lf } from '../../../src/sync/translate.js';

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

const LONE_CR_DOC = '# Title\rline two\r\rpara **bold**\r';

// CM6's Text.of splits on /\r\n?|\n/ and joins with '\n' — the webview doc is
// always the LF-normalized form of whatever the sync carried.
function cm6_normalize(text: string): string {
  return text.split(/\r\n?|\n/).join('\n');
}

function make_host(initial_native: string, eol: '\r\n' | '\n') {
  let native = initial_native;
  let version = 1;
  const posted: Array<{ type: string; text: string }> = [];
  const applies: string[] = [];
  const loop = create_sync_loop(
    {
      uri_string: 'file:///doc.md',
      get_text: () => native_to_lf(native),
      get_version: () => version,
      get_document_dir_webview_uri: () => null,
    },
    { post_message: (m) => posted.push(m as { type: string; text: string }) },
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

describe('INV-SP-4: no-edit cycle on a lone-CR file emits zero WorkspaceEdits', () => {
  it('host LF view equals the CM6-normalized webview doc, so the echo is identity', async () => {
    const h = make_host(LONE_CR_DOC, '\n');
    await h.loop.handle_webview_message({ type: 'ready' });
    expect(h.posted).toHaveLength(1);
    const seed = h.posted[0];
    expect(seed.text).not.toContain('\r');

    // The webview's CM6 doc is the normalized seed; with no user input its
    // echo `update` is byte-identical to the host LF view → no apply.
    const webview_doc = cm6_normalize(seed.text);
    expect(webview_doc).toBe(seed.text);
    await h.loop.handle_webview_message({ type: 'update', text: webview_doc, base_version: 1 });

    expect(h.applies).toEqual([]);
    expect(h.native()).toBe(LONE_CR_DOC);
  });
});

describe('declared behavior: the first edit normalizes lone-CR EOLs file-wide', () => {
  it('LF document: every lone CR becomes LF', async () => {
    const h = make_host(LONE_CR_DOC, '\n');
    await h.loop.handle_webview_message({ type: 'ready' });

    const edited = `${cm6_normalize(h.posted[0].text)}!`;
    await h.loop.handle_webview_message({ type: 'update', text: edited, base_version: 1 });

    expect(h.native()).toBe('# Title\nline two\n\npara **bold**\n!');
    expect(h.native()).not.toContain('\r');
  });

  it('CRLF document: every lone CR becomes CRLF', async () => {
    const h = make_host(LONE_CR_DOC, '\r\n');
    await h.loop.handle_webview_message({ type: 'ready' });

    const edited = `${cm6_normalize(h.posted[0].text)}!`;
    await h.loop.handle_webview_message({ type: 'update', text: edited, base_version: 1 });

    expect(h.native()).toBe('# Title\r\nline two\r\n\r\npara **bold**\r\n!');
  });

  it('a second no-op cycle after normalization is byte-stable', async () => {
    const h = make_host(LONE_CR_DOC, '\n');
    await h.loop.handle_webview_message({ type: 'ready' });
    const edited = `${cm6_normalize(h.posted[0].text)}!`;
    await h.loop.handle_webview_message({ type: 'update', text: edited, base_version: 1 });
    const after_first = h.native();

    await h.loop.handle_webview_message({ type: 'update', text: edited, base_version: 1 });
    expect(h.native()).toBe(after_first);
    expect(h.applies).toHaveLength(1);
  });
});
