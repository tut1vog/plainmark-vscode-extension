import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

// Regression: `plainmark_highlight_style` maps code-token tags to
// `plainmark-syntax-*` classes, and `syntaxHighlighting` applies it across the
// whole document — not just code blocks. `tags.content` is markdown prose AND
// the parent tag of every heading tag, so mapping it to a syntax class wraps
// every heading and paragraph in a code-token class. The class is cosmetically
// inert (colors are scoped to code containers) but semantically wrong and
// fragile under user CSS. It must stay off prose.
describe('CBLK-R-15: code-syntax classes do not leak onto markdown prose', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    container.remove();
  });

  it('headings, paragraphs, and emphasis carry no plainmark-syntax-variable', async () => {
    view = mount_editor(
      container,
      '# Heading one\n\n## Heading two\n\nA paragraph with **bold** and *italic* words.\n',
    );
    await next_frame();
    await next_frame();
    // Sanity: the document actually rendered as headings + styled prose.
    expect(container.querySelector('.plainmark-h1')).not.toBeNull();
    expect(container.querySelector('.plainmark-strong')).not.toBeNull();
    // The regression guard: no code-token class anywhere in this prose-only doc.
    expect(container.querySelectorAll('.plainmark-syntax-variable')).toHaveLength(0);
  });
});
