import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syntaxTreeAvailable } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';
import { marker_metrics_field } from '../../../src/webview/decorations/blockquote.js';
import { frames, next_frame } from '../util.js';

// A zero-font mark over the first `>` stands in for a marker some other
// construct's chrome has collapsed: it is text-backed but has no advance.
const zero_glyph = Decoration.mark({ class: 'test-zero-glyph' });
const zero_first_marker = [
  EditorView.decorations.of(Decoration.set(zero_glyph.range(0, 1))),
  EditorView.theme({ '.test-zero-glyph': { fontSize: '0' } }),
];

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

describe('BQ-R-15: the marker-width probe skips an unmeasurable `>`', () => {
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

describe('BQ-R-12: the marker-width probe measures a quote that scrolls into view', () => {
  const filler = Array.from({ length: 220 }, (_, i) => `Paragraph ${i}: filler text.`);
  const doc = `${filler.join('\n\n')}\n\n> quoted line\n`;
  const quote_pos = doc.indexOf('> quoted');

  function mount(): EditorView {
    host.style.height = '300px';
    host.style.overflow = 'auto';
    return new EditorView({
      state: EditorState.create({ doc, extensions: [...editor_extensions] }),
      parent: host,
    });
  }

  async function scroll_to_quote_and_measure(v: EditorView): Promise<number> {
    v.dispatch({ effects: EditorView.scrollIntoView(quote_pos, { y: 'center' }) });
    for (let i = 0; i < 200 && v.state.field(marker_metrics_field).gt === 0; i++) {
      await next_frame();
    }
    return v.state.field(marker_metrics_field).gt;
  }

  it('measures nothing while the quote is out of view, then measures it once scrolled in', async () => {
    view = mount();
    for (let i = 0; i < 200 && !syntaxTreeAvailable(view.state, doc.length); i++) {
      await next_frame();
    }
    await frames(15);
    expect(view.state.field(marker_metrics_field).gt).toBe(0);
    expect(await scroll_to_quote_and_measure(view)).toBeGreaterThan(0);
  });

  it('measures a quote scrolled into view before the parse has reached it', async () => {
    view = mount();
    expect(syntaxTreeAvailable(view.state, quote_pos)).toBe(false);
    expect(await scroll_to_quote_and_measure(view)).toBeGreaterThan(0);
  });
});
