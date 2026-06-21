import type {
  CursorPosition,
  HostSyncMessage,
  WebviewCursorChangedMessage,
  WebviewToHostMessage,
  WebviewUpdateMessage,
} from './protocol.js';
import { create_logger } from '../log.js';

export type { CursorPosition } from './protocol.js';

const log = create_logger('sync');

export interface SyncDocument {
  uri_string: string;
  get_text(): string; // LF view
  get_version(): number;
  get_document_dir_webview_uri(): string | null;
}

export interface SyncWebviewBus {
  post_message(message: unknown): void;
}

export interface SyncEditApplier {
  apply_full_replace(uri_string: string, lf_text: string): Promise<boolean>;
}

export interface SyncLoopApi {
  handle_webview_message(raw: unknown): Promise<void>;
  handle_text_document_change(uri_string: string): void;
  send_sync(): void;
}

export interface SyncLoopHooks {
  // Called whenever the webview reports a cursor move. Used by the host to
  // cache the latest cursor for the Plainmark → text-editor toggle.
  on_cursor_changed?: (pos: CursorPosition) => void;
  // Returns a pending cursor to inject into the next outgoing `sync` message
  // (and clears it). Used to seed the webview's caret on the first sync after
  // a text-editor → Plainmark toggle. Returning null leaves the sync
  // message free of `initial_cursor`.
  consume_initial_cursor?: () => CursorPosition | null;
}

// Serial `pending` chain keeps at most one applyEdit awaiting, so only the
// in-flight submission and the previous one can still be echoing; 8 is wide margin.
const SELF_VERSION_LIMIT = 8;

export function create_sync_loop(
  document: SyncDocument,
  webview: SyncWebviewBus,
  applier: SyncEditApplier,
  hooks: SyncLoopHooks = {},
): SyncLoopApi {
  // One applyEdit fires onDidChangeTextDocument ≥2 times, all at the SAME
  // document.version (extHostDocuments.ts fan-out), so suppression is keyed on
  // the versions our
  // own applyEdits produced. Versions are never reused, so an external edit —
  // even one whose bytes equal a past submission (split-editor undo, formatter,
  // git checkout) — carries a fresh version and always forwards. Byte equality
  // is checked only against the single in-flight submission, to classify its
  // FIRST fire (whose version is unknown until it fires); that narrow window is
  // the accepted idempotent-external-edit degenerate (SYNC-G-6).
  const self_versions: number[] = [];
  let in_flight_text: string | null = null;
  let saw_echo_fire = false;
  let did_log_suppress = false;
  // Version carried by the last `sync` posted to the webview. An incoming
  // `update` whose `base_version` differs was built before the webview saw
  // that sync — applying it would full-replace over the newer host state.
  let last_synced_version = -1;
  // Gates host→webview forwarding. An `onDidChangeTextDocument` that fires
  // before the webview's `ready` handshake completes would otherwise push a
  // `sync` to a webview whose JS isn't yet listening.
  let has_sent_sync = false;
  // Serializes webview→host processing. Without this, two `onDidReceiveMessage`
  // callbacks fired back-to-back each begin their async work before the prior
  // applyEdit settles, racing the document state read.
  let pending: Promise<void> = Promise.resolve();

  function remember_self_version(version: number): void {
    if (self_versions.includes(version)) return;
    self_versions.push(version);
    if (self_versions.length > SELF_VERSION_LIMIT) self_versions.shift();
  }

  function handle_webview_message(raw: unknown): Promise<void> {
    // `ready` is serialized behind the same `pending` chain as updates: a
    // webview rebooted mid-applyEdit (config change re-sets webview.html)
    // would otherwise be seeded with pre-apply text, and the apply's echo is
    // suppressed — no corrective sync ever comes (SYNC-H-7).
    const message = raw as Partial<WebviewToHostMessage> | null | undefined;
    if (message && typeof message === 'object' && message.type === 'ready') {
      const this_run = pending.catch(() => undefined).then(() => {
        log.debug('ready handshake received', () => ({
          doc_len: document.get_text().length,
          version: document.get_version(),
        }));
        send_sync();
        has_sent_sync = true;
      });
      pending = this_run.catch(() => undefined);
      return this_run;
    }
    // Cursor moves are fire-and-forget metadata — skip the pending-edit queue
    // so a slow applyEdit can't backpressure cursor reporting.
    if (message && typeof message === 'object' && message.type === 'cursor_changed') {
      const cc = message as WebviewCursorChangedMessage;
      if (
        typeof cc.line === 'number' &&
        typeof cc.character === 'number' &&
        Number.isFinite(cc.line) &&
        Number.isFinite(cc.character)
      ) {
        hooks.on_cursor_changed?.({ line: cc.line, character: cc.character });
      }
      return Promise.resolve();
    }
    const this_run = pending.catch(() => undefined).then(() => process_webview_message(raw));
    pending = this_run.catch(() => undefined);
    return this_run;
  }

  async function process_webview_message(raw: unknown): Promise<void> {
    const message = raw as Partial<WebviewToHostMessage> | null | undefined;
    if (!message || typeof message !== 'object') return;
    if (message.type !== 'update') return;

    const update = message as WebviewUpdateMessage;
    const incoming = update.text;
    const current_text = document.get_text();
    log.debug('webview msg in', {
      incoming_len: incoming.length,
      host_lf_len: current_text.length,
      gate_armed: in_flight_text !== null,
    });

    if (update.base_version !== last_synced_version) {
      // The update was built before the webview applied our latest sync —
      // a full replace would clobber whatever that sync carried (external
      // edit, revert). Drop it and re-ground the webview; the keystroke it
      // carried survives in CM6's undo history (syncs are addToHistory:false).
      log.warn('stale update rejected', {
        base_version: update.base_version,
        last_synced_version,
      });
      send_sync();
      return;
    }

    if (incoming === current_text) {
      log.debug('identity check: webview text matches host, no apply');
      return;
    }

    // Arm the gate BEFORE the await — VS Code's extHostDocuments dispatches
    // onDidChangeTextDocument listeners before applyEdit's promise resolves.
    // Arming after
    // the await would leave a window where the first 1-2 fires of the
    // multi-fire fan-out escape suppression.
    in_flight_text = incoming;
    saw_echo_fire = false;
    did_log_suppress = false;

    try {
      const applied = await applier.apply_full_replace(document.uri_string, incoming);
      if (applied) {
        // Defensive: if no echo fire arrived during the await (event timing is
        // not contractual — vscode#111548), record the post-apply version here.
        if (!saw_echo_fire) remember_self_version(document.get_version());
        log.debug('apply ok', () => ({
          host_lf_len_after: document.get_text().length,
        }));
      } else {
        log.warn('apply failed', {
          incoming_len: incoming.length,
          host_lf_len: document.get_text().length,
        });
      }
    } catch (err) {
      // applyEdit can reject with "has changed in the meantime" when an
      // external applyEdit (autosave formatter, codeActionsOnSave, another
      // extension) moves the model's versionId during our IPC roundtrip.
      // Log and recover — the next webview update will retry with current text.
      log.warn('apply threw', {
        reason: err instanceof Error ? err.message : String(err),
        incoming_len: incoming.length,
        host_lf_len: document.get_text().length,
      });
    } finally {
      in_flight_text = null;
    }
  }

  function handle_text_document_change(uri_string: string): void {
    if (uri_string !== document.uri_string) return;
    if (!has_sent_sync) {
      log.debug('host doc change skipped: sync not yet sent');
      return;
    }
    const version = document.get_version();
    if (self_versions.includes(version)) {
      // Every fire of one applyEdit fan-out (and a late dirty-state fire of an
      // earlier back-to-back one) reports the version that apply produced. Log
      // gated to one entry per suppressed burst so a 3-fire fan-out doesn't
      // triple the dev log noise.
      if (!did_log_suppress) {
        log.debug('echo suppression: rejecting echo');
        did_log_suppress = true;
      }
      return;
    }
    if (in_flight_text !== null && document.get_text() === in_flight_text) {
      // First fire of the in-flight applyEdit — its version becomes a recorded
      // self-version so the remaining fires (and late ones) suppress above.
      remember_self_version(version);
      saw_echo_fire = true;
      if (!did_log_suppress) {
        log.debug('echo suppression: rejecting echo');
        did_log_suppress = true;
      }
      return;
    }
    did_log_suppress = false;
    log.debug('host doc change forwarded', () => ({
      host_lf_len: document.get_text().length,
      version: document.get_version(),
    }));
    send_sync();
  }

  function send_sync(): void {
    const message: HostSyncMessage = {
      type: 'sync',
      text: document.get_text(),
      version: document.get_version(),
      document_dir_webview_uri: document.get_document_dir_webview_uri(),
    };
    const pending_cursor = hooks.consume_initial_cursor?.() ?? null;
    if (pending_cursor) {
      message.initial_cursor = pending_cursor;
    }
    last_synced_version = message.version;
    webview.post_message(message);
  }

  return { handle_webview_message, handle_text_document_change, send_sync };
}
