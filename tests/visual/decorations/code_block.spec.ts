import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { ROOT_DEFAULTS_CSS } from '../../../src/theme/root_defaults.js';
import { mount_editor, move_cursor } from '../util.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function wait_frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

interface SetupHandle {
  container: HTMLElement;
  view?: EditorView;
}

function make_setup(): SetupHandle {
  return { container: document.createElement('div') };
}

describe('fenced code block — line chrome', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('renders .plainmark-fenced-code lines and data-language on the header', async () => {
    const doc = '```ts\nconst x = 1;\n```';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 0);
    await next_frame();

    const lines = Array.from(
      h.container.querySelectorAll('.plainmark-fenced-code'),
    );
    expect(lines.length).toBeGreaterThanOrEqual(3);

    const header = h.container.querySelector('.plainmark-fenced-code-header');
    expect(header).not.toBeNull();
    expect(header!.getAttribute('data-language')).toBe('ts');
  });

  it('omits data-language for an empty info-string fence', async () => {
    const doc = '```\nplain\n```';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 0);
    await next_frame();
    const header = h.container.querySelector('.plainmark-fenced-code-header');
    expect(header).not.toBeNull();
    expect(header!.hasAttribute('data-language')).toBe(false);
  });
});

describe('4-space-indented lines — no code chrome (CBLK-E-1)', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('renders indented lines as plain prose with no code classes', async () => {
    const doc = 'paragraph\n\n    const x = 1;\n    const y = 2;\n';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 0);
    await next_frame();
    expect(h.container.querySelectorAll('.plainmark-indented-code').length).toBe(0);
    expect(h.container.querySelectorAll('.plainmark-fenced-code').length).toBe(0);
  });
});

describe('list-nested fenced code — content-column geometry CBLK-R-17 CBLK-R-18', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    h.container.style.width = '600px';
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  // '- item'=0..6, '  ```js'=7..14, '  const x = 1;'=15..29, '  ```'=30..35, 'z'=36
  const doc = '- item\n  ```js\n  const x = 1;\n  ```\nz';

  it('starts the tinted box at the list content column', async () => {
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 36);
    await wait_frames(2);

    const body = h.container.querySelectorAll('.plainmark-fenced-code')[1] as HTMLElement;
    expect(body.classList.contains('plainmark-fenced-code-nested')).toBe(true);
    const box_left =
      body.getBoundingClientRect().left +
      parseFloat(getComputedStyle(body).backgroundPositionX);
    const content_x = h.view.coordsAtPos(2)!.left;
    expect(Math.abs(box_left - content_x)).toBeLessThanOrEqual(1);
  });

  it('renders code flush inside the box — the shared fence indent has no advance', async () => {
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 36);
    await wait_frames(2);

    const at_line_start = h.view.coordsAtPos(15)!.left;
    const past_indent = h.view.coordsAtPos(17)!.left;
    expect(Math.abs(past_indent - at_line_start)).toBeLessThanOrEqual(1);
  });

  it('keeps code x stable when the caret enters the block (never-reveal indent)', async () => {
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 36);
    await wait_frames(2);
    const before = h.view.coordsAtPos(17)!.left;
    move_cursor(h.view, 20);
    await wait_frames(2);
    const after = h.view.coordsAtPos(17)!.left;
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  });
});

describe('quoted fenced code — hidden marker stays hidden BQ-E-13', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  // '> ```js'=0..7, '> const quoted = true;'=8..30, '> ```'=31..36, 'z'=37
  const doc = '> ```js\n> const quoted = true;\n> ```\nz';

  it('keeps the syntax-colored `>` span transparent on a quoted fence body line', async () => {
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 37);
    await wait_frames(2);

    const markers = h.container.querySelectorAll('.plainmark-quote-marker');
    expect(markers.length).toBeGreaterThanOrEqual(3);
    // The body line's marker — the highlighter wraps its `>` in a syntax span.
    const inner = markers[1].querySelector('[class*="plainmark-syntax-"]');
    expect(inner).not.toBeNull();
    expect(getComputedStyle(inner as Element).color).toBe('rgba(0, 0, 0, 0)');
  });

  it('still shows the `>` when the caret is on the line (per-line reveal)', async () => {
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 12);
    await wait_frames(2);

    const revealed = h.container.querySelector('.plainmark-quote-marker-revealed');
    expect(revealed).not.toBeNull();
    const inner = revealed!.querySelector('[class*="plainmark-syntax-"]');
    const glyph = (inner ?? revealed) as Element;
    expect(getComputedStyle(glyph).color).not.toBe('rgba(0, 0, 0, 0)');
  });
});

describe('fenced code block — syntax highlighting CBLK-R-10 CBLK-R-12', () => {
  let h: SetupHandle;
  let injected_style: HTMLStyleElement | null = null;

  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
    injected_style?.remove();
    injected_style = null;
    document.body.classList.remove('vscode-dark');
  });

  // Poll for the `const` keyword token specifically: it can only come from the
  // nested JS grammar overlay (markdown's own fence/info tokens are tagged meta
  // and appear immediately, so they cannot be the wait condition). The grammar
  // loads async (skipping parser → re-parse on resolve); ~200 frames ≈ 3.2s is
  // well past the observed ~200ms. A timeout means the load → re-parse cycle broke.
  async function mount_and_await_keyword(doc: string): Promise<HTMLElement> {
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 0);
    let span = h.container.querySelector('.plainmark-syntax-keyword');
    for (let i = 0; i < 200 && !span; i++) {
      await wait_frames(1);
      span = h.container.querySelector('.plainmark-syntax-keyword');
    }
    expect(span, 'nested-grammar keyword token never appeared').not.toBeNull();
    return span as HTMLElement;
  }

  it('produces .plainmark-syntax-* tokens from the nested grammar after its load resolves', async () => {
    const doc = '```javascript\nconst x = 1;\n```';
    await mount_and_await_keyword(doc);

    expect(
      h.container.querySelectorAll('.plainmark-fenced-code').length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      h.container.querySelectorAll('[class*="plainmark-syntax-"]').length,
    ).toBeGreaterThan(1);
  });

  it('colors tokens via the inline light-palette fallback when no :root defaults exist THEME-V-8', async () => {
    const doc = '```javascript\nconst x = 1;\n```';
    const keyword = await mount_and_await_keyword(doc);

    // --plainmark-syntax-keyword-color is undeclared in the harness → the
    // syntax_palette.ts inline fallback (#0000ff) must apply.
    expect(getComputedStyle(keyword).color).toBe('rgb(0, 0, 255)');
  });

  it('colors tokens from ROOT_DEFAULTS_CSS variables when injected (dark palette) THEME-V-5 THEME-D-6', async () => {
    // Inject the same <style> block provider.ts getHtml() puts in the webview,
    // plus the body class VS Code sets for dark themes. The dark keyword color
    // (#569cd6) differs from the inline fallback, proving the variable chain
    // (not the fallback) is what colors the span.
    injected_style = document.createElement('style');
    injected_style.textContent = ROOT_DEFAULTS_CSS;
    document.head.appendChild(injected_style);
    document.body.classList.add('vscode-dark');

    const doc = '```javascript\nconst x = 1;\n```';
    const keyword = await mount_and_await_keyword(doc);

    expect(getComputedStyle(keyword).color).toBe('rgb(86, 156, 214)');
  });

  it('resolves an aliased fence tag through the alias layer CBLK-R-16', async () => {
    // ```asm has no @codemirror/language-data entry of its own; the alias
    // layer maps it onto the bundled Gas grammar. The `# exit` comment can
    // only be tokenized by that nested grammar (markdown's own fence/info
    // tokens are tagged meta), so its appearance proves the end-to-end
    // wiring: info string → match_code_language → wrapper load → overlay.
    const doc = '```asm\nmovl $1, %eax  # exit\n```';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 0);
    let span = h.container.querySelector('.plainmark-syntax-comment');
    for (let i = 0; i < 200 && !span; i++) {
      await wait_frames(1);
      span = h.container.querySelector('.plainmark-syntax-comment');
    }
    expect(span, 'aliased-grammar comment token never appeared').not.toBeNull();
    expect(span!.textContent).toContain('# exit');
  });
});
