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
    case 'read_clipboard':
      return 'read_clipboard';
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
    case 'normalize_list_indent':
      return 'normalize_list_indent';
    case 'expand_paragraph_seams':
      return 'expand_paragraph_seams';
    case 'compact_paragraph_seams':
      return 'compact_paragraph_seams';
    case 'prettify_seams':
      return 'prettify_seams';
    case 'focus_editor':
      return 'focus_editor';
    case 'style_reload':
      return msg.href;
    case 'scroll_to_heading':
      return `${msg.line}:${msg.character}`;
    case 'paste_image_reply':
      return 'relative_path' in msg ? msg.relative_path : msg.error;
    case 'clipboard_text':
      return msg.text;
    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}

describe('wire protocol', () => {
  // The value is the `never` default above: the run only proves both switches compile.
  it('enumerates every variant of both unions', () => {
    expect(webview_tag({ type: 'ready' })).toBe('ready');
    expect(host_tag({ type: 'focus_editor' })).toBe('focus_editor');
  });
});
