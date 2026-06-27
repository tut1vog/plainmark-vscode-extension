// Single source of truth for the host↔webview wire protocol, imported by both
// the host (sync/loop.ts, host/provider.ts) and the webview (webview/sync.ts).
// MUST stay dependency-free (no `vscode`, no CM6) so both build targets resolve it.

// Line/character (both zero-based) — wire format avoids LF/CRLF byte counting.
export interface CursorPosition {
  line: number;
  character: number;
}

interface WebviewReadyMessage {
  type: 'ready';
}

export interface WebviewUpdateMessage {
  type: 'update';
  text: string;
  // Version of the last HostSyncMessage the webview APPLIED — the host rejects
  // an update built on a stale base instead of clobbering a concurrent edit.
  base_version: number;
}

export interface WebviewCursorChangedMessage {
  type: 'cursor_changed';
  line: number;
  character: number;
}

interface WebviewLinkClickMessage {
  type: 'link_click';
  href: string;
}

interface WebviewStyleLoadErrorMessage {
  type: 'style_load_error';
  href: string;
}

interface WebviewTableEditErrorMessage {
  type: 'table_edit_error';
  reason: string;
}

export interface WebviewPasteImageMessage {
  type: 'paste_image';
  // base64, not ArrayBuffer/Blob — those don't reliably survive the webview↔host clone boundary (vscode#115807).
  data: string;
  mime: string;
}

export type WebviewToHostMessage =
  | WebviewReadyMessage
  | WebviewUpdateMessage
  | WebviewCursorChangedMessage
  | WebviewLinkClickMessage
  | WebviewStyleLoadErrorMessage
  | WebviewTableEditErrorMessage
  | WebviewPasteImageMessage;

export interface HostSyncMessage {
  type: 'sync';
  text: string;
  version: number;
  document_dir_webview_uri: string | null;
  // Set only on the first sync after a text-editor → Plainmark toggle.
  initial_cursor?: CursorPosition;
}

interface HostInsertTableMessage {
  type: 'insert_table';
}

interface HostInsertFootnoteMessage {
  type: 'insert_footnote';
}

// Sent on tab reactivation so the webview refocuses CM6 — VS Code focuses the iframe, not the inner contenteditable, so the retained caret won't render otherwise.
interface HostFocusEditorMessage {
  type: 'focus_editor';
}

interface HostStyleReloadMessage {
  type: 'style_reload';
  href: string;
}

interface HostScrollToHeadingMessage {
  type: 'scroll_to_heading';
  line: number;
  character: number;
}

interface HostPasteImageReplyOk {
  type: 'paste_image_reply';
  relative_path: string;
}

interface HostPasteImageReplyError {
  type: 'paste_image_reply';
  error: string;
}

export type HostPasteImageReplyMessage = HostPasteImageReplyOk | HostPasteImageReplyError;

export type HostToWebviewMessage =
  | HostSyncMessage
  | HostInsertTableMessage
  | HostInsertFootnoteMessage
  | HostFocusEditorMessage
  | HostStyleReloadMessage
  | HostScrollToHeadingMessage
  | HostPasteImageReplyMessage;
