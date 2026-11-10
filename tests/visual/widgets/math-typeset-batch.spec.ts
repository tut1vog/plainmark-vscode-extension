import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';
import { math_cache_field, set_typeset_effect } from '../../../src/webview/widgets/math.js';
import { frames, mount_editor } from '../util.js';

describe('math typeset batching', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;
  let saved_mathjax: Window['MathJax'];

  beforeEach(() => {
    saved_mathjax = window.MathJax;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    window.MathJax = saved_mathjax;
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('MATH-R-4: a burst of typeset results lands as one transaction', async () => {
    const n = 200;
    const release: (() => void)[] = [];
    window.MathJax = {
      tex2chtmlPromise: (src) =>
        new Promise<HTMLElement>((resolve) => {
          const node = document.createElement('mjx-container');
          node.textContent = src;
          release.push(() => resolve(node));
        }),
    };
    const blocks: string[] = [];
    for (let i = 0; i < n; i++) {
      blocks.push(i % 2 === 0 ? `$$\ny_{${i}}\n$$` : `inline $x_{${i}}$ here`);
    }
    const doc = `${blocks.join('\n\n')}\n\ntail`;
    const typeset_tr_sizes: number[] = [];
    const state = EditorState.create({
      doc,
      extensions: [
        ...editor_extensions,
        EditorView.updateListener.of((u) => {
          for (const tr of u.transactions) {
            const size = tr.effects.filter((e) => e.is(set_typeset_effect)).length;
            if (size > 0) typeset_tr_sizes.push(size);
          }
        }),
      ],
      selection: { anchor: doc.length },
    });
    // The init parse is time-boxed; finish it so every formula is pending at mount.
    ensureSyntaxTree(state, state.doc.length, 10_000);
    view = new EditorView({ state: state.update({}).state, parent: container });
    await expect.poll(() => release.length, { timeout: 30000 }).toBe(n);

    for (const r of release) r();
    await expect.poll(() => typeset_tr_sizes.length, { timeout: 30000 }).toBeGreaterThan(0);
    await frames(2);

    expect(typeset_tr_sizes).toEqual([n]);
    expect(container.querySelectorAll('.plainmark-math-pending')).toHaveLength(0);
  });

  it('drops buffered results when the view is destroyed before the flush frame', async () => {
    window.MathJax = {
      tex2chtmlPromise: (src) => {
        const node = document.createElement('mjx-container');
        node.textContent = src;
        return Promise.resolve(node);
      },
    };
    const destroyed = mount_editor(container, 'a $x$ b $y$ c\n\ntail');
    await Promise.resolve();
    destroyed.destroy();
    await frames(2);
    expect(destroyed.state.field(math_cache_field).size).toBe(0);
  });
});
