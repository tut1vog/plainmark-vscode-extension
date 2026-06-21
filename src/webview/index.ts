import { EditorState, type StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  create_update_listener,
  dispatch_host_sync_to_view,
  line_char_to_offset,
  type HostToWebviewMessage,
  type PostMessage,
} from './sync.js';
import { cursor_sync_extension } from './cursor_sync.js';
import {
  PASTE_IMAGE_EVENT,
  create_image_paste_controller,
  type PasteImageDetail,
} from './image_paste.js';
import type { HostPasteImageReplyMessage } from '../sync/protocol.js';
import { insert_footnote } from './decorations/footnote_insert.js';
import { editor_extensions } from './editor_extensions.js';
import { set_image_base_effect } from './widgets/image.js';
import { insert_table_at_caret } from './widgets/insert_table_command.js';
import { scroll_caret_to } from './outline_scroll.js';
import { create_logger } from '../log.js';

const log = create_logger('init');

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  setState(state: unknown): void;
  getState(): unknown;
};

log.debug('webview boot');

const vscode_api = acquireVsCodeApi();
const post_message: PostMessage = (m) => vscode_api.postMessage(m);

// `plainmark.styles` user `<link>` tags carry `data-plainmark-style` so the
// host's `style_reload` message can locate them by their stable original href.
// The HTML parser may have already finished loading (or failing) the stylesheet
// by the time this script runs, so we both attach an `error` listener AND
// check `link.sheet === null` after `window.load` for a belt-and-suspenders
// detection. Each href reports at most once.
const reported_style_errors = new Set<string>();
function report_style_error(link: HTMLLinkElement): void {
  const href = link.dataset['plainmarkStyle'] ?? link.href;
  if (reported_style_errors.has(href)) return;
  reported_style_errors.add(href);
  log.warn('user style <link> load error', { href_len: href.length });
  post_message({ type: 'style_load_error', href });
}
const user_style_links = Array.from(
  document.querySelectorAll<HTMLLinkElement>('link[data-plainmark-style]'),
);
user_style_links.forEach((link) => {
  link.addEventListener('error', () => report_style_error(link));
});
window.addEventListener('load', () => {
  for (const link of user_style_links) {
    if (link.sheet === null) report_style_error(link);
  }
});

const editor_root = document.getElementById('editor') ?? document.body;

// Version of the last APPLIED host sync — stamped onto every outgoing `update`
// as `base_version` so the host can reject a stale full-replace instead of
// letting it clobber a concurrent external edit.
let last_applied_sync_version = -1;

const view = new EditorView({
  state: EditorState.create({
    doc: '',
    extensions: [
      ...editor_extensions,
      EditorView.updateListener.of(
        create_update_listener(post_message, () => last_applied_sync_version),
      ),
      cursor_sync_extension(post_message),
    ],
  }),
  parent: editor_root,
});

// Webview-DevTools diagnostic handle (used to inspect caret/decoration state
// in VS Code's webview console when smoke-only bugs need direct view access).
// Webview CSP blocks third-party scripts, so exposing the view is safe.
(window as { __plainmark_view?: EditorView }).__plainmark_view = view;

const image_paste_controller = create_image_paste_controller(view, post_message);
document.addEventListener(PASTE_IMAGE_EVENT, (event) => {
  const files = (event as CustomEvent<PasteImageDetail>).detail?.files;
  if (Array.isArray(files) && files.length > 0) {
    void image_paste_controller.handle_files(files);
  }
});

document.addEventListener('plainmark-link-click', (event) => {
  const href = (event as CustomEvent<{ href: string }>).detail?.href;
  if (typeof href !== 'string' || href.length === 0) {
    log.debug('plainmark-link-click: empty href, dropping');
    return;
  }
  log.debug('plainmark-link-click: posting to host', { href_len: href.length });
  post_message({ type: 'link_click', href });
});

const reported_table_edit_errors = new Set<string>();
document.addEventListener('plainmark-table-edit-error', (event) => {
  const reason = (event as CustomEvent<{ reason: string }>).detail?.reason;
  if (typeof reason !== 'string') return;
  // One notification per distinct failure — a broken serialize would otherwise toast on every keystroke.
  if (reported_table_edit_errors.has(reason)) return;
  reported_table_edit_errors.add(reason);
  post_message({ type: 'table_edit_error', reason });
});

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as Partial<HostToWebviewMessage> | null | undefined;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'sync') {
    const sync = msg as Extract<HostToWebviewMessage, { type: 'sync' }>;
    const base_effect = set_image_base_effect.of(sync.document_dir_webview_uri ?? null);
    log.debug('received sync', { len: sync.text.length, version: sync.version });
    let selection_anchor: number | undefined;
    const effects: StateEffect<unknown>[] = [base_effect];
    if (sync.initial_cursor) {
      selection_anchor = line_char_to_offset(
        sync.text,
        sync.initial_cursor.line,
        sync.initial_cursor.character,
      );
      effects.push(EditorView.scrollIntoView(selection_anchor, { y: 'center' }));
    }
    dispatch_host_sync_to_view(view, sync.text, effects, selection_anchor, () => {
      // Composition-deferred syncs can settle out of order — never regress.
      if (sync.version > last_applied_sync_version) {
        last_applied_sync_version = sync.version;
      }
    });
    // VS Code focuses the webview iframe but not the inner CM6
    // contenteditable on a text editor → Plainmark toggle, so the caret CM6
    // tracks in state stays invisible (no .cm-cursor render without focus).
    // Focus on initial_cursor so the user lands in an editable state mirroring
    // the text editor side of the toggle.
    if (sync.initial_cursor) {
      view.focus();
    }
    return;
  }
  if (msg.type === 'insert_table') {
    insert_table_at_caret(view);
    return;
  }
  if (msg.type === 'insert_footnote') {
    insert_footnote(view);
    return;
  }
  if (msg.type === 'paste_image_reply') {
    image_paste_controller.deliver_reply(msg as HostPasteImageReplyMessage);
    return;
  }
  if (msg.type === 'scroll_to_heading') {
    const { line, character } = msg as Extract<
      HostToWebviewMessage,
      { type: 'scroll_to_heading' }
    >;
    scroll_caret_to(view, line, character);
    return;
  }
  if (msg.type === 'style_reload') {
    // Cache-bust on the `?v=` query — preserves CM6 cursor/selection state
    // (no full webview reload). THEME-R-9.
    const href = (msg as Extract<HostToWebviewMessage, { type: 'style_reload' }>).href;
    const link = document.querySelector<HTMLLinkElement>(
      `link[data-plainmark-style="${CSS.escape(href)}"]`,
    );
    if (link) {
      link.href = `${href}?v=${Date.now()}`;
    }
    return;
  }
});

post_message({ type: 'ready' });
