import { type Extension, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { HostPasteImageReplyMessage } from '../sync/protocol.js';
import type { PostMessage } from './sync.js';
import { create_logger } from '../log.js';

const log = create_logger('widget');

// A reply the host never sends (a crashed save, a dropped message) would
// otherwise wedge every later image paste behind the unresolved promise.
export const IMAGE_PASTE_REPLY_TIMEOUT_MS = 15_000;

export const PASTE_IMAGE_EVENT = 'plainmark-paste-image';

export interface PasteImageDetail {
  files: File[];
}

function image_files(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

// First custom paste handler in the codebase: image blobs go to the host save
// pipeline; anything else falls through to the default paste (IMG-I-6).
export const image_paste_extension: Extension = EditorView.domEventHandlers({
  paste(event) {
    const files = image_files(event.clipboardData);
    if (files.length === 0) return false;
    event.preventDefault();
    document.dispatchEvent(
      new CustomEvent<PasteImageDetail>(PASTE_IMAGE_EVENT, { detail: { files } }),
    );
    return true;
  },
});

function blob_to_base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('image read failed'));
    reader.readAsDataURL(blob);
  });
}

// Replaces the selection like every other paste path, leaving the caret after the insert.
function insert_pasted_link(view: EditorView, text: string): void {
  view.dispatch({
    ...view.state.replaceSelection(text),
    annotations: [Transaction.userEvent.of('input.paste')],
    scrollIntoView: true,
  });
}

export interface ImagePasteController {
  handle_files(files: File[]): Promise<void>;
  deliver_reply(reply: HostPasteImageReplyMessage): void;
}

// Bridges the host round-trip: post one paste_image per blob, wait for its reply,
// then insert `![](path)` at the caret (one transaction each, one line each per
// IMG-I-10). Batches are chained so two quick pastes can't cross replies.
export function create_image_paste_controller(
  view: EditorView,
  post_message: PostMessage,
  reply_timeout_ms: number = IMAGE_PASTE_REPLY_TIMEOUT_MS,
): ImagePasteController {
  let pending: { id: number; resolve: (reply: HostPasteImageReplyMessage) => void } | null = null;
  let next_id = 0;
  let chain: Promise<void> = Promise.resolve();

  async function run(files: File[]): Promise<void> {
    let first = true;
    for (const file of files) {
      const data = await blob_to_base64(file);
      if (data.length === 0) continue;
      const id = ++next_id;
      const reply = await new Promise<HostPasteImageReplyMessage>((resolve) => {
        const timer = setTimeout(() => {
          if (pending?.id !== id) return;
          pending = null;
          log.warn('paste_image: no host reply', { id, timeout_ms: reply_timeout_ms });
          resolve({ type: 'paste_image_reply', id, error: 'no host reply' });
        }, reply_timeout_ms);
        pending = {
          id,
          resolve: (r) => {
            clearTimeout(timer);
            resolve(r);
          },
        };
        post_message({ type: 'paste_image', id, data, mime: file.type });
      });
      if (!('relative_path' in reply)) break;
      insert_pasted_link(view, (first ? '' : '\n') + `![](${reply.relative_path})`);
      first = false;
    }
  }

  return {
    handle_files(files) {
      chain = chain.then(() => run(files)).catch(() => undefined);
      return chain;
    },
    deliver_reply(reply) {
      if (!pending || reply.id !== pending.id) return;
      const { resolve } = pending;
      pending = null;
      resolve(reply);
    },
  };
}
