import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function header_in(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.plainmark-callout-header');
}

function bodies_in(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.plainmark-callout-body'));
}

function title_widget_in(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.plainmark-callout-title');
}

interface SetupHandle {
  container: HTMLElement;
  view?: EditorView;
}

function make_setup(): SetupHandle {
  return { container: document.createElement('div') };
}

describe('callout decorations — GFM-5 type rendering', () => {
  const types: { source: string; type: string; title: string }[] = [
    { source: '> [!NOTE]\n> body', type: 'note', title: 'Note' },
    { source: '> [!TIP]\n> body', type: 'tip', title: 'Tip' },
    { source: '> [!IMPORTANT]\n> body', type: 'important', title: 'Important' },
    { source: '> [!WARNING]\n> body', type: 'warning', title: 'Warning' },
    { source: '> [!CAUTION]\n> body', type: 'caution', title: 'Caution' },
  ];

  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  for (const { source, type, title } of types) {
    it(`renders ${type} with header role=note + accent class + body chrome + icon + synthesized title`, async () => {
      h.view = mount_editor(h.container, source);
      move_cursor(h.view, source.length);
      await next_frame();

      const header = header_in(h.container);
      expect(header).not.toBeNull();
      expect(header!.getAttribute('role')).toBe('note');
      expect(header!.getAttribute('data-callout-type')).toBe(type);
      expect(header!.classList.contains('plainmark-callout')).toBe(true);

      const bodies = bodies_in(h.container);
      expect(bodies.length).toBeGreaterThanOrEqual(1);
      expect(bodies[0].getAttribute('data-callout-type')).toBe(type);

      const widget = title_widget_in(h.container);
      expect(widget).not.toBeNull();
      const icon = widget!.querySelector('.plainmark-callout-icon');
      expect(icon).not.toBeNull();
      expect(icon!.querySelector('svg')).not.toBeNull();
      const label = widget!.querySelector('.plainmark-callout-title-text');
      expect(label?.textContent).toBe(title);
    });
  }
});

describe('callout decorations — title rendering', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('renders custom title when source has trailing words', async () => {
    const doc = '> [!NOTE] My custom title\n> body';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();
    const label = h.container.querySelector('.plainmark-callout-title-text');
    expect(label?.textContent).toBe('My custom title');
  });

  it('CALL-R-10: resets inherited text-indent on the title so the icon/label gap survives', async () => {
    // The header line carries a negative hanging-indent text-indent; it is
    // inherited and (on some Chromium webview builds) applied to the inline
    // title, dragging the label over the icon. The descendant reset neutralizes
    // it. Guard: the title's computed text-indent is 0 while the line's is not.
    const doc = '> [!WARNING] Careful\n> body';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();
    await next_frame();
    const header = h.container.querySelector('.plainmark-callout-header') as HTMLElement;
    const title = h.container.querySelector('.plainmark-callout-title') as HTMLElement;
    expect(getComputedStyle(title).textIndent).toBe('0px');
    expect(parseFloat(getComputedStyle(header).textIndent)).toBeLessThan(0);
  });
});

describe('CALL-I-1 CALL-R-3: callout decorations — per-line reveal on caret on header line', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('reveals raw [!NOTE] bytes when caret is INSIDE the marker range and re-renders on leave', async () => {
    const doc = '> [!NOTE]\n> body';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();
    expect(title_widget_in(h.container)).not.toBeNull();

    // Caret at offset 3 → inside `[!NOTE]` marker bytes.
    move_cursor(h.view, 3);
    await next_frame();
    expect(title_widget_in(h.container)).toBeNull();
    const header = header_in(h.container);
    expect(header?.textContent ?? '').toContain('[!NOTE]');

    // Caret back to body line: widget re-renders.
    move_cursor(h.view, doc.length);
    await next_frame();
    expect(title_widget_in(h.container)).not.toBeNull();
  });

  it('keeps widget rendered on initial mount (default caret at offset 0 for top-of-doc callout) — regression', async () => {
    const doc = '> [!NOTE]\n> body';
    h.view = mount_editor(h.container, doc);
    // No move_cursor call — CM6's default selection lands at offset 0.
    await next_frame();
    expect(title_widget_in(h.container)).not.toBeNull();
  });

  it('drops the widget when the caret is anywhere on the header line, including offset 0 (per-line reveal)', async () => {
    // Per-line reveal: caret on the header line — even at offset 0,
    // before the `>` — reveals the raw header for editing (CALL-I-1). The
    // earlier node-level reveal model kept the widget here; that expectation is retired.
    const doc = '> [!NOTE]\n> body';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 0);
    await next_frame();
    expect(title_widget_in(h.container)).toBeNull();
    const header = header_in(h.container);
    expect(header?.textContent ?? '').toContain('[!NOTE]');
  });

  it('collapses to widget when caret is off the header line', async () => {
    const doc = '> [!TIP]\n> body line\n\nelsewhere';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();
    expect(title_widget_in(h.container)).not.toBeNull();
  });
});

describe('BQ-E-10: callout decorations — callout chrome suppression', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('does NOT emit data-blockquote-depth on callout lines', async () => {
    const doc = '> [!NOTE]\n> body';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();
    const header = header_in(h.container);
    const bodies = bodies_in(h.container);
    expect(header?.hasAttribute('data-blockquote-depth')).toBe(false);
    for (const b of bodies) {
      expect(b.hasAttribute('data-blockquote-depth')).toBe(false);
    }
    expect(h.container.querySelector('.plainmark-blockquote[data-blockquote-depth]')).toBeNull();
  });

  it('plain blockquotes still get multi-bar chrome (regression)', async () => {
    const doc = '> just a quote\n> line 2';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();
    expect(
      h.container.querySelector('.plainmark-blockquote[data-blockquote-depth="1"]'),
    ).not.toBeNull();
    expect(header_in(h.container)).toBeNull();
  });
});

describe('callout decorations — unknown type', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('renders unknown-type callout with neutral data-callout-type=unknown and capitalized title', async () => {
    const doc = '> [!HINT]\n> body';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();
    const header = header_in(h.container);
    expect(header?.getAttribute('data-callout-type')).toBe('unknown');
    const label = h.container.querySelector('.plainmark-callout-title-text');
    expect(label?.textContent).toBe('Hint');
  });
});

describe('callout decorations — bare callout (no body)', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('renders header only when no body line is present', async () => {
    const doc = '> [!NOTE]';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 0);
    await next_frame();
    const header = header_in(h.container);
    expect(header).not.toBeNull();
    expect(bodies_in(h.container).length).toBe(0);
  });
});

describe('callout decorations — fold marker', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('renders ▸ chevron for `> [!NOTE]-` with no click handler attached', async () => {
    const doc = '> [!NOTE]-\n> body';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();
    const chev = h.container.querySelector('.plainmark-callout-fold-marker');
    expect(chev).not.toBeNull();
    expect(chev!.textContent).toBe('▸');
    expect(chev!.getAttribute('title')).toContain('Collapsibility');
  });

  it('renders ▾ chevron for `> [!NOTE]+`', async () => {
    const doc = '> [!NOTE]+\n> body';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();
    const chev = h.container.querySelector('.plainmark-callout-fold-marker');
    expect(chev?.textContent).toBe('▾');
  });

  it('emits data-callout-fold on header line for fold-marker callouts', async () => {
    const doc = '> [!NOTE]-\n> body';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();
    const header = header_in(h.container);
    expect(header?.getAttribute('data-callout-fold')).toBe('-');
  });
});

describe('BQ-I-2: callout decorations — empty-quote-exit (regression)', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('exits a depth-1 callout in a single keystroke on empty `> ` line', async () => {
    const doc = '> [!NOTE]\n> body\n> ';
    h.view = mount_editor(h.container, doc);
    h.view.dispatch({ selection: { anchor: doc.length } });
    await next_frame();

    h.view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await next_frame();
    const after = h.view.state.doc.toString();
    // The empty `> ` marker is stripped in one transaction (single-transaction contract).
    expect(after.endsWith('> ')).toBe(false);
  });
});
