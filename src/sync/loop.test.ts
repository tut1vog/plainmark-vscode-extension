import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  create_sync_loop,
  type SyncDocument,
  type SyncEditApplier,
  type SyncWebviewBus,
} from './loop.js';

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

interface Harness {
  document: SyncDocument;
  webview: SyncWebviewBus;
  applier: SyncEditApplier;
  posted: unknown[];
  applies: { uri_string: string; text: string }[];
  set_apply_result(value: boolean): void;
  set_text(text: string): void;
}

function make_harness(initial: string, uri = 'file:///doc.md'): Harness {
  let text = initial;
  let version = 1;
  const posted: unknown[] = [];
  const applies: { uri_string: string; text: string }[] = [];
  let apply_result = true;

  const document: SyncDocument = {
    uri_string: uri,
    get_text: () => text,
    get_version: () => version,
    get_document_dir_webview_uri: () => null,
  };
  const webview: SyncWebviewBus = {
    post_message: (m) => posted.push(m),
  };
  const applier: SyncEditApplier = {
    // Models the real applyEdit sequence: the text model mutates (version
    // bump) before the promise resolves; echo fires read the mutated state.
    apply_full_replace: async (uri_string, lf_text) => {
      applies.push({ uri_string, text: lf_text });
      if (!apply_result) return false;
      text = lf_text;
      version++;
      return true;
    },
  };

  return {
    document,
    webview,
    applier,
    posted,
    applies,
    set_apply_result: (v) => {
      apply_result = v;
    },
    set_text: (t) => {
      text = t;
      version++;
    },
  };
}

describe('create_sync_loop SYNC-H-7 SYNC-G-2 SYNC-G-3 SYNC-G-4 SYNC-W-3 SYNC-W-4 SYNC-W-5 SYNC-W-8 SYNC-P-10', () => {
  it('on `ready` posts a `sync` message with current text and version', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    expect(h.posted).toEqual([{ type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null }]);
  });

  it('webview `update` message dispatches a full-text apply to the applier', async () => {
    const h = make_harness('hello world');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    await loop.handle_webview_message({ type: 'update', text: 'HELLO world', base_version: 1 });
    expect(h.applies).toEqual([{ uri_string: 'file:///doc.md', text: 'HELLO world' }]);
  });

  it('identity check: an update whose text equals the host doc is suppressed', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    await loop.handle_webview_message({ type: 'update', text: 'hello', base_version: 1 });
    expect(h.applies).toEqual([]);
  });

  // FIX-2 (review 2026-06-10): an in-flight update built on text A must not
  // apply after an external edit moved the doc to B — the whole-doc replace
  // would silently destroy the external edit, and the corrective change event
  // would never come (the clobbered text was just remembered as self-applied).
  it('stale update (base_version behind the last sync) is rejected and a corrective sync is sent', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' }); // sync v1
    h.set_text('hello external'); // external edit, v2
    loop.handle_text_document_change('file:///doc.md'); // sync v2

    // Update built before the webview applied sync v2.
    await loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 });

    expect(h.applies).toEqual([]);
    expect(h.posted).toEqual([
      { type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null },
      { type: 'sync', text: 'hello external', version: 2, document_dir_webview_uri: null },
      // Corrective sync re-grounding the webview on the current host state.
      { type: 'sync', text: 'hello external', version: 2, document_dir_webview_uri: null },
    ]);
  });

  it('fresh update (base_version matching the last sync) applies', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' }); // sync v1
    h.set_text('hello external'); // v2
    loop.handle_text_document_change('file:///doc.md'); // sync v2

    await loop.handle_webview_message({
      type: 'update',
      text: 'hello external!',
      base_version: 2,
    });
    expect(h.applies).toEqual([{ uri_string: 'file:///doc.md', text: 'hello external!' }]);
  });

  it('host doc change is not forwarded to webview until the ready handshake completes', () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    h.set_text('hello!');
    loop.handle_text_document_change('file:///doc.md');
    expect(h.posted).toEqual([]);
  });

  it('host doc changes flow through to the webview once ready has been received', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    h.set_text('hello!');
    loop.handle_text_document_change('file:///doc.md');
    expect(h.posted).toEqual([
      { type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null },
      { type: 'sync', text: 'hello!', version: 2, document_dir_webview_uri: null },
    ]);
  });

  it('echo suppression: a webview-originated change does not reflect back as a sync', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    await loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 });
    // VS Code firing onDidChangeTextDocument as a result of applyEdit — the
    // applier already mutated the doc to 'hello!' at version 2.
    loop.handle_text_document_change('file:///doc.md');
    expect(h.posted).toEqual([{ type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null }]);
  });

  it('the gate is version-scoped: the next outside edit reflects through', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    await loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 });
    loop.handle_text_document_change('file:///doc.md');
    h.set_text('hello!?');
    loop.handle_text_document_change('file:///doc.md');
    expect(h.posted).toEqual([
      { type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null },
      { type: 'sync', text: 'hello!?', version: 3, document_dir_webview_uri: null },
    ]);
  });

  // FIX-1 (review 2026-06-10): byte-equality suppression swallowed any external
  // edit whose bytes matched a remembered submission (split-editor undo being
  // the easy repro). Version provenance forwards it: the external change event
  // carries a version no self-applyEdit produced.
  it('external edit whose text equals a prior submission IS forwarded', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    await loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 }); // v2, self
    loop.handle_text_document_change('file:///doc.md'); // echo — suppressed

    h.set_text('hello! more'); // external edit, v3
    loop.handle_text_document_change('file:///doc.md');
    h.set_text('hello!'); // external undo back to the prior submission, v4
    loop.handle_text_document_change('file:///doc.md');

    expect(h.posted).toEqual([
      { type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null },
      { type: 'sync', text: 'hello! more', version: 3, document_dir_webview_uri: null },
      { type: 'sync', text: 'hello!', version: 4, document_dir_webview_uri: null },
    ]);
  });

  it('multi-fire fan-out: every fire of one applyEdit is suppressed by its version', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    await loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 }); // v2
    // $acceptModelChanged + $acceptDirtyStateChanged ×2, all at version 2.
    loop.handle_text_document_change('file:///doc.md');
    loop.handle_text_document_change('file:///doc.md');
    loop.handle_text_document_change('file:///doc.md');
    expect(h.posted).toEqual([
      { type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null },
    ]);
  });

  it('apply throwing is caught, logged, and the flag is reset', async () => {
    const h = make_harness('hello');
    h.applier.apply_full_replace = async () => {
      throw new Error('has changed in the meantime');
    };
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    await expect(
      loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 }),
    ).resolves.toBeUndefined();
    h.set_text('hello?');
    loop.handle_text_document_change('file:///doc.md');
    expect(h.posted).toEqual([
      { type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null },
      { type: 'sync', text: 'hello?', version: 2, document_dir_webview_uri: null },
    ]);
  });

  it('apply failure (returns false) resets the flag', async () => {
    const h = make_harness('hello');
    h.set_apply_result(false);
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    await loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 });
    expect(h.applies.length).toBe(1);
    h.set_text('hello?');
    loop.handle_text_document_change('file:///doc.md');
    expect(h.posted).toEqual([
      { type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null },
      { type: 'sync', text: 'hello?', version: 2, document_dir_webview_uri: null },
    ]);
  });

  // Echo-gate failure-path interleaving. The gate arms before the apply await
  // (echoes fire before applyEdit resolves), so a doc-change matching the
  // in-flight submission is suppressed mid-await even if the apply later fails.
  // That suppression is benign — the matching text is the webview's own
  // submission, which it already displays, so no divergence results. The real
  // safety property is that the failure path does not POISON the gate: a later
  // genuine outside edit must still forward.
  it('failure-path interleaving does not poison the gate: a later genuine outside edit still forwards', async () => {
    const h = make_harness('hello');
    let resolve_apply!: (value: boolean) => void;
    let signal_entered!: () => void;
    const entered = new Promise<void>((r) => {
      signal_entered = r;
    });
    h.applier.apply_full_replace = (uri_string, lf_text) => {
      h.applies.push({ uri_string, text: lf_text });
      return new Promise<boolean>((res) => {
        resolve_apply = res;
        signal_entered();
      });
    };
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });

    // Webview submits 'hello!': the gate arms with 'hello!' and the apply goes in-flight.
    const update_p = loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 });
    await entered;

    // A doc-change matching the in-flight submission fires mid-await and is
    // suppressed (benign: the webview already shows 'hello!').
    h.set_text('hello!');
    loop.handle_text_document_change('file:///doc.md');

    // applyEdit then rejects as failed ("changed in the meantime").
    resolve_apply(false);
    await update_p;

    // A subsequent genuine outside edit (new text, new version) must still reach
    // the webview — the failure path must not leave the gate stuck suppressing.
    h.set_text('world');
    loop.handle_text_document_change('file:///doc.md');
    expect(h.posted).toContainEqual({
      type: 'sync',
      text: 'world',
      version: 3,
      document_dir_webview_uri: null,
    });
  });

  // FIX-4 (review 2026-06-10): a webview rebooted while an applyEdit is in
  // flight (config change re-sets webview.html) posts `ready`; a synchronous
  // handler would seed it with pre-apply text, and the apply's echo is
  // suppressed — the stale seed would then full-replace the doc backwards.
  it('`ready` arriving while an apply is pending seeds the post-apply text (SYNC-H-7)', async () => {
    const h = make_harness('hello');
    let resolve_apply!: () => void;
    let signal_entered!: () => void;
    const entered = new Promise<void>((r) => {
      signal_entered = r;
    });
    h.applier.apply_full_replace = async (uri_string, lf_text) => {
      h.applies.push({ uri_string, text: lf_text });
      signal_entered();
      await new Promise<void>((r) => {
        resolve_apply = r;
      });
      h.set_text(lf_text);
      return true;
    };
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' }); // seed sync v1

    const update_p = loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 });
    await entered;

    // Webview reboot mid-apply: the new instance posts `ready`.
    const ready_p = loop.handle_webview_message({ type: 'ready' });
    resolve_apply();
    await Promise.all([update_p, ready_p]);

    const last = h.posted[h.posted.length - 1];
    expect(last).toEqual({
      type: 'sync',
      text: 'hello!',
      version: 2,
      document_dir_webview_uri: null,
    });
  });

  it('outside edit on a different uri is ignored', () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    loop.handle_text_document_change('file:///other.md');
    expect(h.posted).toEqual([]);
  });

  it('outside edit reflects to the webview as a sync message carrying the new text', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    h.set_text('hello!');
    loop.handle_text_document_change('file:///doc.md');
    expect(h.posted).toEqual([
      { type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null },
      { type: 'sync', text: 'hello!', version: 2, document_dir_webview_uri: null },
    ]);
  });

  it('send_sync posts the current text on demand', () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    loop.send_sync();
    expect(h.posted).toEqual([{ type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null }]);
  });

  it('serializes concurrent webview messages: msg2 sees doc state after msg1 settles', async () => {
    const h = make_harness('hello');
    let resolve_first!: () => void;
    let signal_entered!: () => void;
    const entered = new Promise<void>((r) => {
      signal_entered = r;
    });
    const seen_texts: string[] = [];
    let call = 0;
    h.applier.apply_full_replace = async (uri_string, lf_text) => {
      call++;
      seen_texts.push(h.document.get_text());
      h.applies.push({ uri_string, text: lf_text });
      if (call === 1) {
        h.set_text('hello!');
        await new Promise<void>((r) => {
          resolve_first = r;
          signal_entered();
        });
      }
      return true;
    };

    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    const p1 = loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 });
    const p2 = loop.handle_webview_message({ type: 'update', text: 'hello!?', base_version: 1 });

    await entered;
    resolve_first();
    await Promise.all([p1, p2]);

    expect(seen_texts).toEqual(['hello', 'hello!']);
    expect(h.applies.length).toBe(2);
  });

  it('ignores unknown / malformed messages', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message(null);
    await loop.handle_webview_message(undefined);
    await loop.handle_webview_message('not an object');
    await loop.handle_webview_message({ type: 'unknown' });
    expect(h.posted).toEqual([]);
    expect(h.applies).toEqual([]);
  });

  describe('cursor hooks', () => {
    it('cursor_changed message invokes on_cursor_changed with the line/character', async () => {
      const h = make_harness('hello');
      const seen: { line: number; character: number }[] = [];
      const loop = create_sync_loop(h.document, h.webview, h.applier, {
        on_cursor_changed: (pos) => seen.push(pos),
      });
      await loop.handle_webview_message({ type: 'cursor_changed', line: 2, character: 5 });
      expect(seen).toEqual([{ line: 2, character: 5 }]);
    });

    it('cursor_changed bypasses the pending-edit queue and never reaches the applier', async () => {
      const h = make_harness('hello');
      const loop = create_sync_loop(h.document, h.webview, h.applier, {
        on_cursor_changed: () => {},
      });
      await loop.handle_webview_message({ type: 'cursor_changed', line: 0, character: 0 });
      expect(h.applies).toEqual([]);
      expect(h.posted).toEqual([]);
    });

    it('cursor_changed with non-finite numbers is dropped silently', async () => {
      const h = make_harness('hello');
      const seen: { line: number; character: number }[] = [];
      const loop = create_sync_loop(h.document, h.webview, h.applier, {
        on_cursor_changed: (pos) => seen.push(pos),
      });
      await loop.handle_webview_message({ type: 'cursor_changed', line: NaN, character: 0 });
      await loop.handle_webview_message({ type: 'cursor_changed', line: 0, character: 'oops' });
      expect(seen).toEqual([]);
    });

    it('send_sync injects initial_cursor when consume_initial_cursor returns a position', async () => {
      const h = make_harness('hello');
      let popped = false;
      const loop = create_sync_loop(h.document, h.webview, h.applier, {
        consume_initial_cursor: () => {
          if (popped) return null;
          popped = true;
          return { line: 1, character: 3 };
        },
      });
      await loop.handle_webview_message({ type: 'ready' });
      expect(h.posted).toEqual([
        {
          type: 'sync',
          text: 'hello',
          version: 1,
          document_dir_webview_uri: null,
          initial_cursor: { line: 1, character: 3 },
        },
      ]);
    });

    it('subsequent syncs omit initial_cursor once consume returns null', async () => {
      const h = make_harness('hello');
      let popped = false;
      const loop = create_sync_loop(h.document, h.webview, h.applier, {
        consume_initial_cursor: () => {
          if (popped) return null;
          popped = true;
          return { line: 0, character: 0 };
        },
      });
      await loop.handle_webview_message({ type: 'ready' });
      h.set_text('hello!');
      loop.handle_text_document_change('file:///doc.md');
      expect(h.posted).toHaveLength(2);
      expect((h.posted[1] as { initial_cursor?: unknown }).initial_cursor).toBeUndefined();
    });

    it('hooks default to no-op when omitted', async () => {
      const h = make_harness('hello');
      const loop = create_sync_loop(h.document, h.webview, h.applier);
      // Should not throw with neither hook supplied.
      await loop.handle_webview_message({ type: 'cursor_changed', line: 0, character: 0 });
      await loop.handle_webview_message({ type: 'ready' });
      expect(h.posted).toEqual([
        { type: 'sync', text: 'hello', version: 1, document_dir_webview_uri: null },
      ]);
    });
  });
});
