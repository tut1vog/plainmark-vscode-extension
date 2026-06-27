import { describe, expect, it } from 'vitest';
import type { HostToWebviewMessage, WebviewToHostMessage } from './protocol.js';

// Exhaustive over the union — adding a member without a case is a compile error,
// which is the guard that keeps host and webview from drifting silently.
function webview_tag(msg: WebviewToHostMessage): string {
  switch (msg.type) {
    case 'ready':
      return 'ready';
    case 'update':
      return msg.text;
    case 'cursor_changed':
      return `${msg.line}:${msg.character}`;
    case 'link_click':
      return msg.href;
    case 'style_load_error':
      return msg.href;
    case 'table_edit_error':
      return msg.reason;
    case 'paste_image':
      return msg.mime;
    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}

function host_tag(msg: HostToWebviewMessage): string {
  switch (msg.type) {
    case 'sync':
      return `${msg.version}`;
    case 'insert_table':
      return 'insert_table';
    case 'insert_footnote':
      return 'insert_footnote';
    case 'focus_editor':
      return 'focus_editor';
    case 'style_reload':
      return msg.href;
    case 'scroll_to_heading':
      return `${msg.line}:${msg.character}`;
    case 'paste_image_reply':
      return 'relative_path' in msg ? msg.relative_path : msg.error;
    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}

describe('wire protocol', () => {
  it('round-trips every webview→host variant through JSON and the union', () => {
    const messages: WebviewToHostMessage[] = [
      { type: 'ready' },
      { type: 'update', text: 'hello', base_version: 4 },
      { type: 'cursor_changed', line: 3, character: 7 },
      { type: 'link_click', href: './a.md' },
      { type: 'style_load_error', href: 'file:///x.css' },
      { type: 'table_edit_error', reason: 'boom' },
      { type: 'paste_image', data: 'aGVsbG8=', mime: 'image/png' },
    ];
    for (const original of messages) {
      const decoded = JSON.parse(JSON.stringify(original)) as WebviewToHostMessage;
      expect(decoded).toEqual(original);
      expect(webview_tag(decoded)).toBe(webview_tag(original));
    }
  });

  it('round-trips every host→webview variant through JSON and the union', () => {
    const messages: HostToWebviewMessage[] = [
      { type: 'sync', text: 'doc', version: 2, document_dir_webview_uri: null },
      { type: 'sync', text: 'doc', version: 3, document_dir_webview_uri: 'vscode://x', initial_cursor: { line: 1, character: 0 } },
      { type: 'insert_table' },
      { type: 'insert_footnote' },
      { type: 'focus_editor' },
      { type: 'style_reload', href: 'file:///x.css' },
      { type: 'scroll_to_heading', line: 42, character: 3 },
      { type: 'paste_image_reply', relative_path: 'assets/x.png' },
      { type: 'paste_image_reply', error: 'no writable filesystem' },
    ];
    for (const original of messages) {
      const decoded = JSON.parse(JSON.stringify(original)) as HostToWebviewMessage;
      expect(decoded).toEqual(original);
      expect(host_tag(decoded)).toBe(host_tag(original));
    }
  });
});
