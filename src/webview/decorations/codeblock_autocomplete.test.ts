import { CompletionContext } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { match_code_language } from '../language_aliases.js';
import { codeblock_completions } from './codeblock_autocomplete.js';

function state_with(doc: string, anchor: number = doc.length): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ extensions: [GFM] })],
  });
}

function context_at(doc: string, pos: number, explicit = true): CompletionContext {
  const state = state_with(doc, pos);
  return new CompletionContext(state, pos, explicit);
}

describe('codeblock_completions — gating CBLK-I-15', () => {
  it('returns null on an empty line', () => {
    expect(codeblock_completions(context_at('', 0))).toBeNull();
  });

  it('returns null on a plain paragraph line', () => {
    const doc = 'abc';
    expect(codeblock_completions(context_at(doc, doc.length))).toBeNull();
  });

  it('returns null on a two-char fence (``py — not a fence)', () => {
    const doc = '``py';
    expect(codeblock_completions(context_at(doc, doc.length))).toBeNull();
  });

  it('returns null at 4-space indent (indented code, not a fence)', () => {
    const doc = '    ```py';
    expect(codeblock_completions(context_at(doc, doc.length))).toBeNull();
  });

  it('returns null once the info string has a second word (```python foo)', () => {
    const doc = '```python foo';
    expect(codeblock_completions(context_at(doc, doc.length))).toBeNull();
  });

  it('returns null when caret is inside the fence run (``|`)', () => {
    expect(codeblock_completions(context_at('```py', 2))).toBeNull();
  });

  it('returns null inside the block body', () => {
    const doc = '```js\nconst x';
    expect(codeblock_completions(context_at(doc, doc.length))).toBeNull();
  });

  it('returns null on a bare fence when NOT explicit (Enter must stay a plain newline)', () => {
    const doc = '```';
    expect(codeblock_completions(context_at(doc, doc.length, false))).toBeNull();
  });

  it('returns the full list on a bare fence when explicit (Ctrl-Space)', () => {
    const doc = '```';
    const result = codeblock_completions(context_at(doc, doc.length, true));
    expect(result).not.toBeNull();
    expect(result!.from).toBe(3);
  });
});

describe('codeblock_completions — triggers CBLK-I-15', () => {
  it('fires on ```p with caret at end, non-explicit (the auto-typing path)', () => {
    const doc = '```p';
    const result = codeblock_completions(context_at(doc, doc.length, false));
    expect(result).not.toBeNull();
    expect(result!.from).toBe(3);
  });

  it('fires on a tilde fence ~~~p', () => {
    const doc = '~~~p';
    const result = codeblock_completions(context_at(doc, doc.length));
    expect(result).not.toBeNull();
    expect(result!.from).toBe(3);
  });

  it('fires on a longer fence ````p (from after the whole run)', () => {
    const doc = '````p';
    const result = codeblock_completions(context_at(doc, doc.length));
    expect(result).not.toBeNull();
    expect(result!.from).toBe(4);
  });

  it('fires inside a blockquote (> ```p) and nested (> > ```p)', () => {
    const quoted = '> ```p';
    expect(codeblock_completions(context_at(quoted, quoted.length))).not.toBeNull();
    const nested = '> > ```p';
    expect(codeblock_completions(context_at(nested, nested.length))).not.toBeNull();
  });

  it('fires at 0–3 spaces of indent', () => {
    const doc = '   ```p';
    const result = codeblock_completions(context_at(doc, doc.length));
    expect(result).not.toBeNull();
    expect(result!.from).toBe(6);
  });

  it('fires on a fence line in the middle of a document', () => {
    const doc = 'paragraph one\n\n```p';
    expect(codeblock_completions(context_at(doc, doc.length))).not.toBeNull();
  });

  it('fires with caret mid-tag (```p|ython) — regex tests text-before-caret only', () => {
    const doc = '```python';
    const result = codeblock_completions(context_at(doc, 4));
    expect(result).not.toBeNull();
    expect(result!.from).toBe(3);
  });
});

describe('codeblock_completions — option shape CBLK-I-16', () => {
  const result = codeblock_completions(context_at('```p', 4))!;

  it('labels are lowercase and deduplicated', () => {
    const labels = result.options.map((o) => o.label);
    for (const label of labels) expect(label).toBe(label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('covers every stock registry name plus the alias-layer tags and mermaid', () => {
    const labels = new Set(result.options.map((o) => o.label));
    for (const lang of languages) expect(labels.has(lang.name.toLowerCase())).toBe(true);
    for (const tag of ['py', 'assembly', 'wasm', 'matlab', 'golang', 'mermaid']) {
      expect(labels.has(tag)).toBe(true);
    }
  });

  it('details carry the canonical language name', () => {
    const detail_of = (label: string): string | undefined =>
      result.options.find((o) => o.label === label)?.detail;
    expect(detail_of('python')).toBe('Python');
    expect(detail_of('py')).toBe('Python');
    expect(detail_of('assembly')).toBe('Gas');
    expect(detail_of('matlab')).toBe('Octave');
    expect(detail_of('mermaid')).toBe('Mermaid diagram');
  });

  it('every suggested tag except mermaid resolves through match_code_language', () => {
    for (const opt of result.options) {
      if (opt.label === 'mermaid') continue;
      expect(match_code_language(opt.label), opt.label).not.toBeNull();
    }
  });

  it('`from` is the tag start (typed prefix is replaced, not appended to)', () => {
    expect(result.from).toBe(3);
  });

  it('does not set filter:false (fuzzy filtering on the typed tag is desired)', () => {
    expect(result.filter).not.toBe(false);
  });
});
