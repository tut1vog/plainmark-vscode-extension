import { type Completion, type CompletionResult, CompletionContext } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { math_extension as math_grammar_extension } from '../grammar/math.js';
import { latex_completions } from './latex_autocomplete.js';
import { LATEX_COMMANDS } from './latex_commands.js';

const md = markdown({ extensions: [GFM, math_grammar_extension] });

function complete(doc: string, pos: number, explicit = true): CompletionResult | null {
  const state = EditorState.create({ doc, selection: { anchor: pos }, extensions: [md] });
  return latex_completions(new CompletionContext(state, pos, explicit));
}

function after(doc: string, needle: string): number {
  return doc.indexOf(needle) + needle.length;
}

function opt(result: CompletionResult, label: string): Completion | undefined {
  return result.options.find((o) => o.label === label);
}

describe('MATH-I-11 latex_completions — gating', () => {
  it('offers the whole catalog, in catalog order, inside a parsed inline-math node', () => {
    const doc = '$\\var$';
    const result = complete(doc, after(doc, '\\var'));
    expect(result).not.toBeNull();
    expect(result!.options.map((o) => o.label)).toEqual(LATEX_COMMANDS.map((c) => c.label));
  });

  it('carries each command\'s glyph as detail and a snippet apply only for templates', () => {
    const doc = '$\\var$';
    const result = complete(doc, after(doc, '\\var'))!;
    for (const cmd of LATEX_COMMANDS) {
      const option = opt(result, cmd.label)!;
      expect(option.detail, cmd.label).toBe(cmd.glyph);
      expect(typeof option.apply, cmd.label).toBe(cmd.template ? 'function' : 'undefined');
    }
  });

  it('offers commands inside a parsed block-math node', () => {
    const doc = '$$\n\\alpha\n$$\n';
    const result = complete(doc, after(doc, '\\alpha'));
    expect(result).not.toBeNull();
    expect(opt(result!, '\\alpha')).toBeDefined();
  });

  it('returns null outside any math node (prose)', () => {
    const doc = '\\alpha here';
    expect(complete(doc, after(doc, '\\alpha'))).toBeNull();
  });

  it('returns null inside an inline code span', () => {
    const doc = '`\\alpha`';
    expect(complete(doc, after(doc, '\\alpha'))).toBeNull();
  });

  it('returns null inside a fenced code block', () => {
    const doc = '```\n$\\frac$\n```\n';
    expect(complete(doc, after(doc, '\\frac'))).toBeNull();
  });

  it('returns null inside math when no backslash token precedes the caret', () => {
    const doc = '$x$';
    expect(complete(doc, 2)).toBeNull();
  });

  it('returns null on a bare backslash when not explicitly invoked', () => {
    const doc = '$$\nx\\\n$$\n';
    const pos = after(doc, 'x\\');
    expect(complete(doc, pos, false)).toBeNull();
  });

  it('offers the full list on a bare backslash when explicitly invoked', () => {
    const doc = '$$\nx\\\n$$\n';
    const pos = after(doc, 'x\\');
    const result = complete(doc, pos, true);
    expect(result).not.toBeNull();
    expect(result!.options.map((o) => o.label)).toEqual(LATEX_COMMANDS.map((c) => c.label));
  });
});

describe('MATH-I-12 latex_completions — replacement range', () => {
  it('anchors `from` at the backslash so the typed token is replaced', () => {
    const doc = '$\\var$';
    const result = complete(doc, after(doc, '\\var'));
    expect(result!.from).toBe(doc.indexOf('\\var'));
  });
});

describe('MATH-I-13 latex_completions — frequency boost', () => {
  it('boosts each command by its occurrence count within math ranges', () => {
    const doc = '$\\alpha + \\alpha + \\beta$\n$\\g$';
    const result = complete(doc, doc.length - 1)!;
    expect(opt(result, '\\alpha')!.boost).toBe(2);
    expect(opt(result, '\\beta')!.boost).toBe(1);
    expect(opt(result, '\\gamma')!.boost).toBeUndefined();
  });
});

describe('MATH-I-12 MATH-I-13 latex_completions — apply and detail', () => {
  it('gives argument commands a snippet apply and plain symbols none', () => {
    const doc = '$\\f$';
    const result = complete(doc, after(doc, '\\f'))!;
    expect(typeof opt(result, '\\frac')!.apply).toBe('function');
    expect(opt(result, '\\alpha')!.apply).toBeUndefined();
  });

  it('shows the Unicode glyph in the completion detail', () => {
    const doc = '$\\f$';
    const result = complete(doc, after(doc, '\\f'))!;
    expect(opt(result, '\\varepsilon')!.detail).toBe('ε');
    expect(opt(result, '\\alpha')!.detail).toBe('α');
    expect(opt(result, '\\sin')!.detail).toBeUndefined();
  });
});
