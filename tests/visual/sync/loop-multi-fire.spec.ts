import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  create_sync_loop,
  type SyncDocument,
  type SyncEditApplier,
  type SyncWebviewBus,
} from '../../../src/sync/loop.js';

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

describe('create_sync_loop multi-fire echo (T11 regression) SYNC-G-2 SYNC-G-3 SYNC-G-6 SYNC-H-1 SYNC-H-4', () => {
  it('suppresses all fires of a single applyEdit fan-out (a)', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    expect(h.posted.length).toBe(1);

    await loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 });

    // VS Code's extHostDocuments fires _onDidChangeDocument from three call
    // sites for one applyEdit ($acceptModelChanged + $acceptDirtyStateChanged
    // ×2), all at the same document.version.
    loop.handle_text_document_change('file:///doc.md');
    loop.handle_text_document_change('file:///doc.md');
    loop.handle_text_document_change('file:///doc.md');

    expect(h.posted.length).toBe(1);
  });

  it('genuine external edit after a self-echo still forwards to the webview (b)', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    await loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 });

    loop.handle_text_document_change('file:///doc.md');

    h.set_text('XYZ');
    loop.handle_text_document_change('file:///doc.md');

    // .length is unstable across boolean vs identity-check implementations;
    // only the divergent forward is contract — assert on the tail post.
    const last = h.posted[h.posted.length - 1];
    expect(last).toEqual({
      type: 'sync',
      text: 'XYZ',
      version: 3,
      document_dir_webview_uri: null,
    });
  });

  it('arms the gate before applyEdit awaits, suppressing fires that arrive during the await (d)', async () => {
    const h = make_harness('hello');
    let resolve_apply!: () => void;
    let signal_entered!: () => void;
    const entered_apply = new Promise<void>((r) => {
      signal_entered = r;
    });

    // Model VS Code's real sequence: text-model is mutated, listeners are
    // dispatched, THEN applyEdit's promise resolves. The default fake
    // applier resolves synchronously and hides the race.
    h.applier.apply_full_replace = async (uri_string, lf_text) => {
      h.applies.push({ uri_string, text: lf_text });
      h.set_text(lf_text);
      signal_entered();
      await new Promise<void>((r) => {
        resolve_apply = r;
      });
      return true;
    };

    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    expect(h.posted.length).toBe(1);

    const update_done = loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 });
    await entered_apply;

    loop.handle_text_document_change('file:///doc.md');
    loop.handle_text_document_change('file:///doc.md');

    resolve_apply();
    await update_done;

    loop.handle_text_document_change('file:///doc.md');

    expect(h.posted.length).toBe(1);
  });

  it('back-to-back applies: a late fire of an earlier intermediate is suppressed (e)', async () => {
    // Two keystrokes faster than one host round-trip ('a' → 'ab' → 'abc') put two
    // applyEdits back-to-back. apply('ab') settles and mutates the model; apply
    // ('abc') then enters and BLOCKS before mutating, so the live document still
    // reads the intermediate 'ab' while the gate has already advanced to 'abc'.
    // A single-snapshot gate forwards that stale 'ab' as a `sync`, whose min-diff
    // strands the caret before the just-typed char. The recorded self-version of
    // apply('ab') suppresses it.
    const h = make_harness('a');
    let n = 0;
    let resolve_second!: () => void;
    let signal_second_entered!: () => void;
    const second_entered = new Promise<void>((r) => {
      signal_second_entered = r;
    });
    h.applier.apply_full_replace = async (uri_string, lf_text) => {
      h.applies.push({ uri_string, text: lf_text });
      n++;
      if (n === 1) {
        h.set_text(lf_text);
        return true;
      }
      signal_second_entered();
      await new Promise<void>((r) => {
        resolve_second = r;
      });
      h.set_text(lf_text);
      return true;
    };

    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' }); // sync('a')

    await loop.handle_webview_message({ type: 'update', text: 'ab', base_version: 1 });
    loop.handle_text_document_change('file:///doc.md'); // model 'ab' — suppressed

    const second = loop.handle_webview_message({ type: 'update', text: 'abc', base_version: 1 });
    await second_entered; // window now holds 'ab' and 'abc'; model still 'ab'

    // apply('ab')'s deferred dirty-state fire lands here, while the model is 'ab'.
    loop.handle_text_document_change('file:///doc.md');

    resolve_second();
    await second;
    loop.handle_text_document_change('file:///doc.md'); // model 'abc' — suppressed

    const sync_texts = h.posted
      .filter(
        (m): m is { type: 'sync'; text: string } =>
          !!m && typeof m === 'object' && (m as { type?: string }).type === 'sync',
      )
      .map((s) => s.text);
    // Only the initial ready sync — the intermediate 'ab' must never escape.
    expect(sync_texts).toEqual(['a']);
  });

  it('idempotent external edit while the apply is in flight is absorbed (c, known degenerate)', async () => {
    // The version-keyed gate (FIX-1, review 2026-06-10) narrowed SYNC-G-6: the
    // byte check now exists only to classify the in-flight apply's first fire,
    // so an idempotent external edit is absorbed only inside that await window
    // (harmless — the webview already shows the matching text). This test pins
    // the residual degenerate so future agents don't "fix" it.
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
      return true;
    };
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });

    const update_done = loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 });
    await entered;

    // An external write of the exact in-flight bytes lands mid-await — it is
    // indistinguishable from our own echo and is absorbed.
    h.set_text('hello!');
    loop.handle_text_document_change('file:///doc.md');

    resolve_apply();
    await update_done;

    expect(h.posted.length).toBe(1);
  });

  it('idempotent external edit after the apply settles is forwarded (FIX-1)', async () => {
    const h = make_harness('hello');
    const loop = create_sync_loop(h.document, h.webview, h.applier);
    await loop.handle_webview_message({ type: 'ready' });
    await loop.handle_webview_message({ type: 'update', text: 'hello!', base_version: 1 }); // v2
    loop.handle_text_document_change('file:///doc.md'); // echo — suppressed

    // A save-time formatter re-writes the same bytes at a NEW version: the
    // version-keyed gate forwards it (a no-op for the webview, which applies
    // nothing on identical text — SYNC-G-5).
    h.set_text('hello!');
    loop.handle_text_document_change('file:///doc.md');

    const last = h.posted[h.posted.length - 1];
    expect(last).toEqual({
      type: 'sync',
      text: 'hello!',
      version: 3,
      document_dir_webview_uri: null,
    });
  });
});
