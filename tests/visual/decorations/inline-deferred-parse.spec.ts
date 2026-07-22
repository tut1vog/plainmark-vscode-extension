import { afterEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { syntaxTreeAvailable } from '@codemirror/language';
import { mount_editor } from '../util.js';

// Inline-decoration ViewPlugins must rebuild when CM6's lazy parse
// advances the tree (effect-only transactions: no docChanged / viewportChanged
// / selectionSet). Jump past the parse frontier and wait — with no further
// interaction — for the heading chrome and footnote widget to appear.

const DEEP_HEADING = '## deep heading past the parse frontier';
const DEEP_FOOTNOTE = 'Deep paragraph with a footnote[^deep].';

function long_doc(): string {
  const filler = Array.from(
    { length: 220 },
    (_, i) => `Paragraph ${i}: filler text pushing the tail past the initial parse window.`,
  ).join('\n\n');
  return `# Top\n\n${filler}\n\n${DEEP_HEADING}\n\n${DEEP_FOOTNOTE}\n\n[^deep]: deep definition.\n\nEnd of document.\n`;
}

async function wait_for(predicate: () => boolean, timeout_ms = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout_ms) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
  return predicate();
}

describe('inline decorations after deferred (lazy) parse', () => {
  let host: HTMLElement | null = null;
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    host?.remove();
    host = null;
  });

  it('decorates a deep heading and footnote ref with no edit/click/scroll after the jump', async () => {
    const doc = long_doc();
    const heading_pos = doc.indexOf(DEEP_HEADING);
    expect(heading_pos).toBeGreaterThan(3000);

    host = document.createElement('div');
    host.style.height = '400px';
    host.style.overflow = 'auto';
    document.body.appendChild(host);
    view = mount_editor(host, doc);

    // Repro precondition: the tail is beyond the initial parse frontier.
    expect(syntaxTreeAvailable(view.state, heading_pos)).toBe(false);

    view.dispatch({
      effects: EditorView.scrollIntoView(heading_pos, { y: 'center' }),
    });

    const heading_decorated = () => host!.querySelector('.plainmark-h2') !== null;
    const footnote_widgetized = () =>
      host!.querySelector('[data-plainmark-footnote-ref]') !== null;

    // Stays raw forever if the tree-advance trigger is dropped (the parse
    // lands via an effect-only transaction that matches no other rebuild gate).
    expect(await wait_for(() => heading_decorated() && footnote_widgetized())).toBe(true);
  });
});
