import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

interface SetupHandle {
  container: HTMLElement;
  view?: EditorView;
}

function make_setup(): SetupHandle {
  return { container: document.createElement('div') };
}

describe('frontmatter — line chrome', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('FM-R-4 FM-R-5: renders header (data-language="yaml") + body + footer line classes', async () => {
    const doc = '---\ntitle: foo\ndate: 2026-05-19\n---\n# Body\n';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();

    const header = h.container.querySelector('.plainmark-frontmatter-header');
    expect(header).not.toBeNull();
    expect(header!.getAttribute('data-language')).toBe('yaml');

    const body_lines = h.container.querySelectorAll('.plainmark-frontmatter');
    expect(body_lines.length).toBeGreaterThanOrEqual(2);

    const footer = h.container.querySelector('.plainmark-frontmatter-footer');
    expect(footer).not.toBeNull();
  });

  it('FM-R-4: renders multi-line frontmatter with all body lines tagged', async () => {
    const doc = '---\ntitle: foo\ndate: 2026-05-19\ntags:\n  - a\n  - b\n---\n\nProse.\n';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();

    const body_lines = h.container.querySelectorAll('.plainmark-frontmatter');
    expect(body_lines.length).toBe(5);
  });

  it('FM-E-3: does not render frontmatter chrome when --- appears mid-document', async () => {
    const doc = '# Heading\n\n---\nfoo: bar\n---\n';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();

    expect(h.container.querySelector('.plainmark-frontmatter-header')).toBeNull();
    expect(h.container.querySelector('.plainmark-frontmatter-footer')).toBeNull();
  });
});
