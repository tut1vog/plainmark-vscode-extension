import { afterEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { table_widgets_field } from '../../../src/webview/widgets/table.js';

// TBL-R-15: a block-widget StateField must rebuild when CM6's lazy/background
// parse advances the tree, so a deep table widgetizes with no edit. Asserted on
// the decoration set, not a DOM count: CM6 builds DOM only for the visible
// viewport and the two tables sit ~4500px apart, so they never co-render.

const SMALL_TABLE = '| a | b |\n|---|---|\n| 1 | 2 |\n';
const DEEP_TABLE = '| x | y | z |\n|---|---|---|\n| 7 | 8 | 9 |\n';

function long_doc(): string {
  const filler = Array.from(
    { length: 220 },
    (_, i) => `Paragraph ${i}: filler text pushing the next table past the initial parse window.`,
  ).join('\n\n');
  return `${SMALL_TABLE}\n${filler}\n\n${DEEP_TABLE}\nEnd of document.\n`;
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

describe('TBL-R-15 block widget renders after deferred (lazy) parse', () => {
  let host: HTMLElement | null = null;
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    host?.remove();
    host = null;
  });

  it('widgetizes a table beyond the initial parse window with no edit', async () => {
    const doc = long_doc();
    expect(doc.indexOf(DEEP_TABLE)).toBeGreaterThan(3000);

    host = document.createElement('div');
    host.style.height = '400px';
    host.style.overflow = 'auto';
    document.body.appendChild(host);
    view = mount_editor(host, doc);

    const table_decoration_count = () => view!.state.field(table_widgets_field).size;

    // Stays at 1 forever if the tree-advance trigger is dropped (no edit fires).
    const rebuilt = await wait_for(() => table_decoration_count() >= 2);
    expect(rebuilt).toBe(true);
    expect(table_decoration_count()).toBe(2);

    view.dispatch({
      effects: EditorView.scrollIntoView(doc.indexOf(DEEP_TABLE), { y: 'center' }),
    });
    const deep_rendered = await wait_for(() =>
      Array.from(host!.querySelectorAll('.plainmark-table-block')).some((el) =>
        el.textContent?.includes('z'),
      ),
    );
    expect(deep_rendered).toBe(true);
  });
});
