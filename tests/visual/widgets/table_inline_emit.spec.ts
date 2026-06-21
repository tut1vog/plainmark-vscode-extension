import { markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { EditorState, Text } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { math_extension as math_grammar_extension } from '../../../src/webview/grammar/math.js';
import { math_cache_key, type MathResult } from '../../../src/webview/widgets/math.js';
import { emit_table_cell } from '../../../src/webview/widgets/table_inline_emit.js';

function find_cell(doc: string, predicate: (text: string) => boolean): { cell: SyntaxNode; doc: Text } {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, math_grammar_extension] })],
  });
  let match: SyntaxNode | null = null;
  syntaxTree(state).iterate({
    enter(node) {
      if (match) return false;
      if (node.name === 'TableCell') {
        const text = state.doc.sliceString(node.from, node.to);
        if (predicate(text)) {
          match = node.node;
          return false;
        }
      }
      return;
    },
  });
  if (!match) throw new Error(`no TableCell matched in doc: ${doc}`);
  return { cell: match, doc: state.doc };
}

function emit(
  doc_text: string,
  predicate: (text: string) => boolean,
  cache: Map<string, MathResult> = new Map(),
  image_base: string | null = null,
): DocumentFragment {
  const { cell, doc } = find_cell(doc_text, predicate);
  return emit_table_cell(cell, doc, cache, image_base);
}

function host(frag: DocumentFragment): HTMLElement {
  const div = document.createElement('div');
  div.appendChild(frag);
  return div;
}

describe('TBL-R-3: emit_table_cell — plain text and escapes', () => {
  it('emits plain prose as a text node', () => {
    const frag = emit('| hello world |\n|---|\n| body |\n', (t) => t.includes('hello'));
    const h = host(frag);
    expect(h.querySelector('strong')).toBeNull();
    expect(h.textContent?.trim()).toBe('hello world');
  });

  it('renders \\| as literal | (not as a pipe-delimiter)', () => {
    const frag = emit('| a \\| b |\n|---|\n| body |\n', (t) => t.includes('\\|'));
    const h = host(frag);
    expect(h.textContent).toContain('|');
    expect(h.textContent).not.toContain('\\|');
  });

  it('renders \\* as literal * (not as emphasis)', () => {
    const frag = emit('| a \\*b\\* c |\n|---|\n| body |\n', (t) => t.includes('\\*'));
    const h = host(frag);
    expect(h.querySelector('em')).toBeNull();
    expect(h.querySelector('strong')).toBeNull();
    expect(h.textContent).toContain('*b*');
    expect(h.textContent).not.toContain('\\*');
  });

  it('renders \\\\ as a single literal backslash', () => {
    const frag = emit('| a \\\\ b |\n|---|\n| body |\n', (t) => t.includes('\\\\'));
    const h = host(frag);
    expect(h.textContent).toContain('\\');
    expect(h.textContent).not.toContain('\\\\');
  });
});

describe('TBL-R-3: emit_table_cell — inline formatting', () => {
  it('emits **bold** as <strong> with the label as descendant text', () => {
    const frag = emit('| **bold** |\n|---|\n| body |\n', (t) => t.includes('**bold**'));
    const h = host(frag);
    const strong = h.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('bold');
  });

  it('emits *italic* as <em>', () => {
    const frag = emit('| *it* |\n|---|\n| body |\n', (t) => t.includes('*it*'));
    const h = host(frag);
    const em = h.querySelector('em');
    expect(em).not.toBeNull();
    expect(em?.textContent).toBe('it');
  });

  it('emits ~~strike~~ as <del>', () => {
    const frag = emit('| ~~gone~~ |\n|---|\n| body |\n', (t) => t.includes('~~gone~~'));
    const h = host(frag);
    const del = h.querySelector('del');
    expect(del).not.toBeNull();
    expect(del?.textContent).toBe('gone');
  });

  it('emits `code` as <code> with verbatim contents (no escape processing)', () => {
    const frag = emit('| `a\\|b` |\n|---|\n| body |\n', (t) => t.includes('`'));
    const h = host(frag);
    const code = h.querySelector('code');
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe('a\\|b');
    expect(code?.className).toBe('plainmark-inline-code');
  });

  it('renders nested *em* inside **strong** as nested DOM', () => {
    const frag = emit('| **bold *and em* end** |\n|---|\n| body |\n', (t) => t.includes('**bold'));
    const h = host(frag);
    const strong = h.querySelector('strong');
    expect(strong).not.toBeNull();
    const em = strong?.querySelector('em');
    expect(em).not.toBeNull();
    expect(em?.textContent).toBe('and em');
  });
});

describe('TBL-R-3: emit_table_cell — links and images', () => {
  it('emits [label](url) as <a href> with label as descendant text', () => {
    const frag = emit('| [click](https://example.com) |\n|---|\n| body |\n', (t) => t.includes('[click]'));
    const h = host(frag);
    const a = h.querySelector('a');
    expect(a).not.toBeNull();
    expect(a?.getAttribute('href')).toBe('https://example.com');
    expect(a?.textContent).toBe('click');
  });

  it('renders nested **bold** inside a link label as <a><strong>...', () => {
    const frag = emit('| [**bold**](https://x.test) |\n|---|\n| body |\n', (t) => t.includes('[**bold**]'));
    const h = host(frag);
    const a = h.querySelector('a');
    expect(a).not.toBeNull();
    const strong = a?.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('bold');
  });

  it('emits ![alt](url) as <img alt>', () => {
    const frag = emit('| ![pic](https://example.com/x.png) |\n|---|\n| body |\n', (t) => t.includes('![pic]'));
    const h = host(frag);
    const img = h.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.alt).toBe('pic');
  });

  it('resolves <img src> from raw url when image_base is provided', () => {
    const frag = emit(
      '| ![p](sub/x.png) |\n|---|\n| body |\n',
      (t) => t.includes('![p]'),
      new Map(),
      'https://example.com/notes/',
    );
    const h = host(frag);
    const img = h.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/notes/sub/x.png');
  });
});

describe('TBL-R-4: emit_table_cell — math (EMIT1)', () => {
  it('cache hit: emits cached HTML inside <span class="plainmark-math-inline">', () => {
    const cache = new Map<string, MathResult>();
    cache.set(math_cache_key(false, 'x^2'), { ok: true, html: '<mjx-test>X2</mjx-test>' });
    const frag = emit('| $x^2$ |\n|---|\n| body |\n', (t) => t.includes('$x^2$'), cache);
    const h = host(frag);
    const span = h.querySelector('span.plainmark-math-inline');
    expect(span).not.toBeNull();
    expect(span?.classList.contains('plainmark-math-pending')).toBe(false);
    expect(span?.querySelector('mjx-test')).not.toBeNull();
  });

  it('cache miss: emits pending placeholder span (plainmark-math-pending)', () => {
    const frag = emit('| $x^2$ |\n|---|\n| body |\n', (t) => t.includes('$x^2$'), new Map());
    const h = host(frag);
    const span = h.querySelector('span.plainmark-math-inline');
    expect(span).not.toBeNull();
    expect(span?.classList.contains('plainmark-math-pending')).toBe(true);
    expect(span?.innerHTML).toBe('');
  });

  it('cache hit uses the inline-keyed entry, not the block-keyed entry, for $...$ math', () => {
    const cache = new Map<string, MathResult>();
    cache.set(math_cache_key(true, 'x^2'), { ok: true, html: '<mjx-wrong>BLOCK</mjx-wrong>' });
    cache.set(math_cache_key(false, 'x^2'), { ok: true, html: '<mjx-right>INLINE</mjx-right>' });
    const frag = emit('| $x^2$ |\n|---|\n| body |\n', (t) => t.includes('$x^2$'), cache);
    const h = host(frag);
    const span = h.querySelector('span.plainmark-math-inline');
    expect(span?.querySelector('mjx-right')).not.toBeNull();
    expect(span?.querySelector('mjx-wrong')).toBeNull();
  });
});

describe('TBL-R-5: emit_table_cell — <br> handling (BR1)', () => {
  it('renders inline <br> as a real <br> element', () => {
    const frag = emit('| a<br>b |\n|---|\n| body |\n', (t) => t.includes('<br>'));
    const h = host(frag);
    expect(h.querySelector('br')).not.toBeNull();
    expect(h.textContent).not.toContain('<br>');
  });

  it('renders <br/> as a real <br> element', () => {
    const frag = emit('| a<br/>b |\n|---|\n| body |\n', (t) => t.includes('<br/>'));
    const h = host(frag);
    expect(h.querySelector('br')).not.toBeNull();
  });

  it('renders <br /> as a real <br> element', () => {
    const frag = emit('| a<br />b |\n|---|\n| body |\n', (t) => t.includes('<br />'));
    const h = host(frag);
    expect(h.querySelector('br')).not.toBeNull();
  });
});

describe('TBL-R-5 TBL-E-10: emit_table_cell — raw HTML wrapped in .plainmark-html-inline + .plainmark-syntax-tag (T17.14)', () => {
  it('wraps <sub>x</sub> in chrome + syntax-tag spans — no <sub> element', () => {
    const frag = emit('| a<sub>x</sub>b |\n|---|\n| body |\n', (t) => t.includes('<sub>'));
    const h = host(frag);
    // Source bytes preserved literally; no <sub> element parsed.
    expect(h.querySelector('sub')).toBeNull();
    expect(h.textContent).toContain('<sub>');
    expect(h.textContent).toContain('</sub>');
    // Outer chrome wraps + inner syntax-tag span supplies the color
    // (matches the main-view lang-html overlay output's scoped CSS rule).
    const chrome_spans = h.querySelectorAll('span.plainmark-html-inline');
    expect(chrome_spans.length).toBe(2);
    expect(chrome_spans[0].textContent).toBe('<sub>');
    expect(chrome_spans[1].textContent).toBe('</sub>');
    const inner_tag_spans = h.querySelectorAll(
      'span.plainmark-html-inline > span.plainmark-syntax-tag',
    );
    expect(inner_tag_spans.length).toBe(2);
    expect(inner_tag_spans[0].textContent).toBe('<sub>');
    expect(inner_tag_spans[1].textContent).toBe('</sub>');
  });

  it('wraps <span>...</span> in chrome + syntax-tag spans', () => {
    const frag = emit('| a<span>x</span>b |\n|---|\n| body |\n', (t) => t.includes('<span>'));
    const h = host(frag);
    expect(h.textContent).toContain('<span>');
    expect(h.textContent).toContain('</span>');
    const chrome_spans = h.querySelectorAll('span.plainmark-html-inline');
    expect(chrome_spans.length).toBe(2);
    const inner_tag_spans = h.querySelectorAll(
      'span.plainmark-html-inline > span.plainmark-syntax-tag',
    );
    expect(inner_tag_spans.length).toBe(2);
    expect(inner_tag_spans[0].textContent).toBe('<span>');
    expect(inner_tag_spans[1].textContent).toBe('</span>');
  });
});

describe('emit_table_cell — fallback / mismatched grammar', () => {
  it('TBL-R-3: emits source text without throwing for a cell with no inline children', () => {
    const frag = emit('| just words |\n|---|\n| body |\n', (t) => t.includes('just words'));
    const h = host(frag);
    expect(h.textContent?.trim()).toBe('just words');
  });

  it('returns a DocumentFragment (not an element wrapper)', () => {
    const { cell, doc } = find_cell('| plain |\n|---|\n| body |\n', (t) => t.includes('plain'));
    const frag = emit_table_cell(cell, doc, new Map(), null);
    expect(frag).toBeInstanceOf(DocumentFragment);
  });
});
