import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';
import {
  create_update_listener,
  dispatch_host_sync_to_view,
  type PostMessage,
} from '../../../src/webview/sync.js';
import {
  create_sync_loop,
  type SyncDocument,
  type SyncEditApplier,
  type SyncWebviewBus,
} from '../../../src/sync/loop.js';
import type { HostSyncMessage, WebviewToHostMessage } from '../../../src/sync/protocol.js';
import { allow_console } from '../console-sentinel.js';

// End-to-end sync round-trip: a real CM6 `EditorView` (production
// `editor_extensions` + the production `create_update_listener`) wired to the
// production `create_sync_loop` over an in-memory document. The two halves are
// otherwise only tested in isolation (src/sync/loop.test.ts + loop-multi-fire
// against stub docs; src/webview/sync.test.ts + composition-guard against fakes
// or a bare view), so echo suppression, base-version stamping, and min-diff
// caret preservation are never exercised TOGETHER against a real view + real
// loop. This spec closes that integration gap.
//
// Transport (postMessage-vs-direct choice): each direction is an explicit FIFO
// inbox drained by an async `pump()`. Chosen over real setTimeout/postMessage
// because the count assertions ("exactly N posts/applies") and the scenario-3
// interleave need deterministic ordering, and over bare direct calls because
// the queues preserve FIFO-per-direction and thread the real applyEdit await —
// the microtask hop the loop's gate-arming (arm BEFORE await) depends on. The
// `onDidChangeTextDocument` fan-out fires synchronously during that await,
// faithful to VS Code's extHostDocuments dispatch timing.

const URI = 'file:///round-trip.md';

function make_round_trip(initial: string, uri = URI) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  // --- in-memory host document (models vscode.TextDocument semantics) --------
  let doc_text = initial;
  let doc_version = 1;
  // Wired to loop.handle_text_document_change once the loop exists. The applier
  // and external_edit call it to fire onDidChangeTextDocument.
  let fire_change: () => void = () => {};

  const document_iface: SyncDocument = {
    uri_string: uri,
    get_text: () => doc_text,
    get_version: () => doc_version,
    get_document_dir_webview_uri: () => null,
  };

  // --- transport: one FIFO inbox per direction ------------------------------
  const host_inbox: unknown[] = []; // webview -> host
  const webview_inbox: HostSyncMessage[] = []; // host -> webview
  const updates_to_host: WebviewToHostMessage[] = []; // recorded webview posts
  const syncs_to_webview: HostSyncMessage[] = []; // recorded host syncs delivered
  const applies: string[] = []; // texts the applier full-replaced

  const post_to_host: PostMessage = (m) => {
    updates_to_host.push(m);
    host_inbox.push(m);
  };
  const webview_bus: SyncWebviewBus = {
    post_message: (m) => {
      webview_inbox.push(m as HostSyncMessage);
    },
  };

  // --- applier: whole-doc replace against the in-memory document -------------
  // Models workspace.applyEdit: the text model mutates and version bumps, and
  // VS Code dispatches onDidChangeTextDocument DURING the await (before the
  // promise resolves), so the in-flight echo gate sees it.
  const applier: SyncEditApplier = {
    apply_full_replace: async (target_uri, lf_text) => {
      if (target_uri !== uri) return false; // provider-side URI guard
      applies.push(lf_text);
      doc_text = lf_text;
      doc_version += 1;
      fire_change(); // primary $acceptModelChanged fire, in-flight-gated
      return true;
    },
  };

  // --- webview: production editor_extensions + production update listener ----
  let last_applied_sync_version = -1;
  const view = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        ...editor_extensions,
        EditorView.updateListener.of(
          create_update_listener(post_to_host, () => last_applied_sync_version),
        ),
      ],
    }),
    parent: container,
  });

  const loop = create_sync_loop(document_iface, webview_bus, applier);
  fire_change = () => loop.handle_text_document_change(uri);

  // Mirrors src/webview/index.ts's `message` handler for a `sync`. Effects /
  // selection_anchor are omitted: this round-trip carries no image base and no
  // initial_cursor.
  function deliver_sync(sync: HostSyncMessage): void {
    syncs_to_webview.push(sync);
    dispatch_host_sync_to_view(view, sync.text, [], undefined, () => {
      if (sync.version > last_applied_sync_version) last_applied_sync_version = sync.version;
    });
  }

  // Drain both directions until quiescent. Host messages are processed before
  // webview deliveries, which models "an in-flight webview update reaches the
  // host before a pending host sync reaches the webview" — one valid
  // cross-direction ordering, and the one that drives scenario 3's corrective
  // sync. Awaiting handle_webview_message threads the real applyEdit hop.
  async function pump(): Promise<void> {
    for (let guard = 0; guard < 1000; guard++) {
      if (host_inbox.length > 0) {
        await loop.handle_webview_message(host_inbox.shift());
        continue;
      }
      if (webview_inbox.length > 0) {
        deliver_sync(webview_inbox.shift()!);
        continue;
      }
      return;
    }
    throw new Error('pump did not settle — possible sync/update feedback cycle');
  }

  return {
    view,
    applies,
    syncs_to_webview,
    updates_to_host,
    get_doc_text: () => doc_text,
    get_doc_version: () => doc_version,
    // SYNC-H-7: the webview's `ready` handshake seeds the view with the current
    // document text; the seed sync carries syncAnnotation so it does not echo.
    handshake: async (): Promise<void> => {
      host_inbox.push({ type: 'ready' });
      await pump();
    },
    // A real user keystroke: change + resulting caret (after the inserted text).
    type_in_view: (from: number, to: number, insert: string): void => {
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
    },
    move_caret: (anchor: number): void => {
      view.dispatch({ selection: { anchor } });
    },
    // An external editor mutates the file: version bump + one change event.
    external_edit: (next: string): void => {
      doc_text = next;
      doc_version += 1;
      fire_change();
    },
    // A late dirty-state fire of the just-settled applyEdit (VS Code fans one
    // applyEdit out to N>=2 onDidChangeTextDocument fires at the same version;
    // this one lands after the promise resolved, so the in-flight text gate is
    // already cleared and only the recorded self-version can suppress it).
    fire_deferred_change: (): void => {
      fire_change();
    },
    pump,
    destroy: (): void => {
      view.destroy();
      container.remove();
    },
  };
}

describe('sync round-trip — webview view <-> loop <-> in-memory document', () => {
  let rt: ReturnType<typeof make_round_trip> | undefined;

  beforeEach(() => {
    rt = undefined;
  });

  afterEach(() => {
    rt?.destroy();
    rt = undefined;
  });

  // Scenario 1 — SYNC-W-1, SYNC-G-1, SYNC-G-2, SYNC-G-3
  it('a webview edit round-trips to the host with no echo back to the view', async () => {
    rt = make_round_trip('hello');
    await rt.handshake();

    // SYNC-G-1: the seed sync carried syncAnnotation and did NOT echo back as an
    // `update` (the update listener skips sync-annotated transactions).
    expect(rt.updates_to_host.length).toBe(0);

    const posts0 = rt.updates_to_host.length;
    const applies0 = rt.applies.length;
    const syncs0 = rt.syncs_to_webview.length;

    // Type '!' at the end of 'hello'. SYNC-W-1: the listener posts the whole doc
    // text plus base_version = the last APPLIED sync version (1, from the seed).
    rt.type_in_view(5, 5, '!');
    await rt.pump();

    // SYNC-G-3: model the deferred dirty-state fan-out fire that lands after the
    // applyEdit settled. The in-flight text gate is cleared by now, so only the
    // recorded self-version (version provenance) can suppress it.
    rt.fire_deferred_change();
    await rt.pump();

    // Exactly one update out, carrying the whole text and the seed's version.
    expect(rt.updates_to_host.length - posts0).toBe(1);
    expect(rt.updates_to_host[rt.updates_to_host.length - 1]).toEqual({
      type: 'update',
      text: 'hello!',
      base_version: 1,
    });
    // Exactly one WorkspaceEdit applied, and the host document now holds it.
    expect(rt.applies.length - applies0).toBe(1);
    expect(rt.applies[rt.applies.length - 1]).toBe('hello!');
    expect(rt.get_doc_text()).toBe('hello!');

    // SYNC-G-2 / SYNC-G-3: ZERO syncs came back to the view. Both the
    // in-flight-gated fire and the late version-gated fire were suppressed, so
    // the loop never re-applies the webview's own edit.
    expect(rt.syncs_to_webview.length - syncs0).toBe(0);

    // The view is stable: its own edit is not clobbered by an echo, and the
    // caret stays where typing left it.
    expect(rt.view.state.doc.toString()).toBe('hello!');
    expect(rt.view.state.selection.main.head).toBe(6);
  });

  // Scenario 2 — SYNC-H-1, SYNC-H-2
  it('an external edit propagates to the view and preserves the caret (min-diff)', async () => {
    rt = make_round_trip('hello world');
    await rt.handshake();
    const syncs0 = rt.syncs_to_webview.length;
    const applies0 = rt.applies.length;

    // Place the caret at offset 3 (inside 'hello') — a point the edit will not
    // touch.
    rt.move_caret(3);

    // An external editor inserts 'brave ' before 'world' — a region entirely
    // after the caret. SYNC-H-1: the host forwards a single `sync`.
    rt.external_edit('hello brave world');
    await rt.pump();

    expect(rt.syncs_to_webview.length - syncs0).toBe(1);
    // No apply on this direction — host -> webview never applyEdits.
    expect(rt.applies.length - applies0).toBe(0);
    // Converged.
    expect(rt.get_doc_text()).toBe('hello brave world');
    expect(rt.view.state.doc.toString()).toBe('hello brave world');

    // SYNC-H-2: the sync is dispatched as a minimal-range change that does not
    // span the caret, so the caret is preserved at 3 — NOT collapsed to offset
    // 0 the way a whole-doc replace would.
    expect(rt.view.state.selection.main.head).toBe(3);
  });

  // Scenario 3 — SYNC-W-8 (interleaving / stale base / corrective sync)
  it('an outside edit interleaved with an in-flight webview edit converges via corrective sync', async () => {
    rt = make_round_trip('hello');
    await rt.handshake();
    const syncs0 = rt.syncs_to_webview.length;
    const applies0 = rt.applies.length;

    // The stale-base rejection logs an expected host warning; keep the sentinel
    // active for everything else.
    allow_console('stale update rejected');

    // An external edit lands: the host advances to v2 and queues a sync toward
    // the webview — but the webview has NOT applied it yet, so its base stays
    // v1.
    rt.external_edit('hello EXT');

    // Meanwhile the webview types 'Z'. The update is built on the stale base v1
    // (last APPLIED sync version), because the v2 sync is still in flight.
    rt.type_in_view(5, 5, 'Z');

    // Host processes the stale update first. SYNC-W-8: base_version (1) != the
    // last posted sync version (2) -> reject with no applyEdit, and re-ground
    // the webview with a corrective sync of current host state.
    await rt.pump();

    // SYNC-W-8: the stale update produced NO WorkspaceEdit — the webview's 'Z'
    // is dropped from the wire (host-side external edit wins); it remains
    // reachable in CM6's undo history since syncs are addToHistory:false.
    expect(rt.applies.length - applies0).toBe(0);

    // Two syncs reached the view: the original external-edit sync and the
    // corrective re-ground; both carry v2's text, the second is an identity
    // no-op.
    expect(rt.syncs_to_webview.length - syncs0).toBe(2);

    // Convergence: the external edit won on both sides, no dropped external
    // edit, view and document agree.
    expect(rt.get_doc_text()).toBe('hello EXT');
    expect(rt.view.state.doc.toString()).toBe('hello EXT');
    expect(rt.view.state.doc.toString()).toBe(rt.get_doc_text());
  });
});
