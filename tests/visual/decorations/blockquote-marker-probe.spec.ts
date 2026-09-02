import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';
import { marker_metrics_field } from '../../../src/webview/decorations/blockquote.js';
import { next_frame } from '../util.js';

// A zero-font mark over the first `>` stands in for a marker some other
// construct's chrome has collapsed: it is text-backed but has no advance.
const zero_glyph = Decoration.mark({ class: 'test-zero-glyph' });
const zero_first_marker = [
  EditorView.decorations.of(Decoration.set(zero_glyph.range(0, 1))),
  EditorView.theme({ '.test-zero-glyph': { fontSize: '0' } }),
];

describe('BQ-R-15: the marker-width probe skips an unmeasurable `>`', () => {
  let host: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '600px';
    document.body.appendChild(host);
  });
  afterEach(() => {
    view?.destroy();
    view = undefined;
    host.remove();
  });

  it('measures the next visible marker when the first has no advance', async () => {
    const doc = '> a\n> b';
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [...editor_extensions, zero_first_marker],
      }),
      parent: host,
    });
    // The probe retries a zero measurement for up to ten frames before giving up.
    for (let i = 0; i < 40 && view.state.field(marker_metrics_field).gt === 0; i++) {
      await next_frame();
    }
    expect(view.state.field(marker_metrics_field).gt).toBeGreaterThan(0);
  });
});
