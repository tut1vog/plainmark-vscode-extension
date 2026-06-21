import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';
import { set_image_base_effect } from '../../../src/webview/widgets/image.js';
import {
  PASTE_IMAGE_EVENT,
  create_image_paste_controller,
  type PasteImageDetail,
} from '../../../src/webview/image_paste.js';
import type { HostPasteImageReplyMessage, WebviewToHostMessage } from '../../../src/sync/protocol.js';

function png_file(name = 'pasted.png'): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' });
}

// A controller wired to a host that replies synchronously — `pending` is already
// armed when `post_message` runs, so `handle_files` resolves on the next tick.
function wire(view: EditorView, reply_for: (index: number) => HostPasteImageReplyMessage) {
  const posted: WebviewToHostMessage[] = [];
  const controller = create_image_paste_controller(view, (m) => {
    const index = posted.length;
    posted.push(m);
    controller.deliver_reply(reply_for(index));
  });
  return { controller, posted };
}

describe('image paste', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('IMG-I-6: detects a clipboard image, prevents default, and emits the paste event', () => {
    view = mount_editor(container, 'hello', 'https://example.test/');
    let detail: PasteImageDetail | undefined;
    const listener = (e: Event) => {
      detail = (e as CustomEvent<PasteImageDetail>).detail;
    };
    document.addEventListener(PASTE_IMAGE_EVENT, listener);
    try {
      const dt = new DataTransfer();
      dt.items.add(png_file());
      const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(detail?.files).toHaveLength(1);
      expect(detail?.files[0].type).toBe('image/png');
    } finally {
      document.removeEventListener(PASTE_IMAGE_EVENT, listener);
    }
  });

  it('IMG-I-6: a text-only paste falls through to the default handler', () => {
    view = mount_editor(container, 'hello', 'https://example.test/');
    let fired = false;
    const listener = () => {
      fired = true;
    };
    document.addEventListener(PASTE_IMAGE_EVENT, listener);
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', ' world');
      const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(event);
      // Image handler stays out; CM6's default paste inserts the text at the caret.
      expect(fired).toBe(false);
      expect(view.state.doc.toString()).toBe('hello world');
    } finally {
      document.removeEventListener(PASTE_IMAGE_EVENT, listener);
    }
  });

  it('IMG-I-6: posts base64 bytes plus the blob MIME type to the host', async () => {
    view = mount_editor(container, '', 'https://example.test/');
    const { controller, posted } = wire(view, () => ({
      type: 'paste_image_reply',
      relative_path: 'pasted.png',
    }));
    await controller.handle_files([png_file()]);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: 'paste_image', mime: 'image/png' });
    // base64 of the 4 PNG magic bytes, no data: prefix
    expect((posted[0] as { data: string }).data).toBe('iVBORw==');
  });

  it('IMG-SP-3: inserts ![](path) at the caret in one transaction, preserving other bytes', async () => {
    let doc_changes = 0;
    const start = 'intro\n\noutro';
    view = new EditorView({
      state: EditorState.create({
        doc: start,
        extensions: [
          ...editor_extensions,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) doc_changes++;
          }),
        ],
      }),
      parent: container,
    });
    view.dispatch({ effects: set_image_base_effect.of('https://example.test/') });
    const caret = 'intro\n\n'.length;
    move_cursor(view, caret);

    const { controller } = wire(view, () => ({ type: 'paste_image_reply', relative_path: 'pasted.png' }));
    await controller.handle_files([png_file()]);

    const after = view.state.doc.toString();
    expect(after).toBe('intro\n\n![](pasted.png)outro');
    expect(after.slice(0, caret)).toBe(start.slice(0, caret));
    expect(after.slice(caret + (after.length - start.length))).toBe(start.slice(caret));
    expect(view.state.selection.main.head).toBe(caret + '![](pasted.png)'.length);
    expect(doc_changes).toBe(1);
  });

  it('IMG-I-10: multiple images insert one per line in clipboard order', async () => {
    view = mount_editor(container, '', 'https://example.test/');
    move_cursor(view, 0);
    const { controller, posted } = wire(view, (i) => ({
      type: 'paste_image_reply',
      relative_path: `img-${i + 1}.png`,
    }));
    await controller.handle_files([png_file('a.png'), png_file('b.png')]);
    expect(posted).toHaveLength(2);
    expect(view.state.doc.toString()).toBe('![](img-1.png)\n![](img-2.png)');
  });

  it('IMG-I-8: an error reply inserts nothing', async () => {
    view = mount_editor(container, 'hello', 'https://example.test/');
    move_cursor(view, view.state.doc.length);
    const { controller } = wire(view, () => ({
      type: 'paste_image_reply',
      error: 'no writable filesystem',
    }));
    await controller.handle_files([png_file()]);
    expect(view.state.doc.toString()).toBe('hello');
  });

  it('IMG-I-6: a pasted image renders as a widget once the caret leaves it', async () => {
    view = mount_editor(container, 'para\n\n', 'https://example.test/');
    move_cursor(view, view.state.doc.length);
    const { controller } = wire(view, () => ({ type: 'paste_image_reply', relative_path: 'pasted.png' }));
    await controller.handle_files([png_file()]);
    // caret sits in the freshly inserted image paragraph → raw source revealed
    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(0);
    move_cursor(view, 0);
    const imgs = container.querySelectorAll('.plainmark-image-block img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe('https://example.test/pasted.png');
    expect(imgs[0].getAttribute('alt')).toBe('');
  });
});
