import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { type Tag, tags } from '@lezer/highlight';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { build_inline_decorations, build_registry } from './inline_decorations.js';
import { code_block_handlers, plainmark_highlight_style } from './code_block.js';

function make_state(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor },
  });
}

function make_state_sel(doc: string, anchor: number, head: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor, head },
  });
}

interface DecoSnapshot {
  from: number;
  to: number;
  class: string | undefined;
  data_language: string | null;
}

const registry = build_registry(code_block_handlers);

function snapshot(state: EditorState): DecoSnapshot[] {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    registry,
  );
  const out: DecoSnapshot[] = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    const spec = deco.spec as {
      class?: string;
      attributes?: Record<string, string>;
    };
    out.push({
      from,
      to,
      class: spec.class,
      data_language: spec.attributes?.['data-language'] ?? null,
    });
  });
  out.sort((a, b) => a.from - b.from);
  return out;
}

function lines(state: EditorState): DecoSnapshot[] {
  return snapshot(state).filter((d) => !d.class?.includes('marker'));
}

function markers(state: EditorState): DecoSnapshot[] {
  return snapshot(state).filter((d) => d.class?.includes('marker'));
}

describe('fenced code block — basic ts block', () => {
  it('emits header + body + footer line decorations with data-language="ts"', () => {
    const doc = '```ts\nfoo\n```\n';
    const state = make_state(doc, 0);
    const out = lines(state);

    expect(out.length).toBe(3);
    expect(out[0].class).toContain('plainmark-fenced-code-header');
    expect(out[0].data_language).toBe('ts');
    expect(out[1].class).toContain('plainmark-fenced-code');
    expect(out[1].class).not.toContain('plainmark-fenced-code-header');
    expect(out[1].class).not.toContain('plainmark-fenced-code-footer');
    expect(out[2].class).toContain('plainmark-fenced-code-footer');
  });
});

describe('fenced code block — empty info string', () => {
  it('omits data-language when no info string is present', () => {
    const doc = '```\nfoo\n```\n';
    const state = make_state(doc, 0);
    const out = lines(state);

    expect(out.length).toBe(3);
    expect(out[0].class).toContain('plainmark-fenced-code-header');
    expect(out[0].data_language).toBeNull();
  });
});

describe('fenced code block — whole-node fence reveal CBLK-I-1 CBLK-I-2', () => {
  // 'a'=0, '```ts'=2..7, 'foo'=8..11, '```'=12..15, 'b'=16
  const doc = 'a\n```ts\nfoo\n```\nb\n';

  it('hides both fences when the caret is outside the block (before)', () => {
    const m = markers(make_state(doc, 0));
    expect(m.length).toBe(2);
    expect(m[0].from).toBe(2);
    expect(m[0].to).toBe(7);
    expect(m[1].from).toBe(12);
    expect(m[1].to).toBe(15);
  });

  it('hides both fences when the caret is outside the block (after)', () => {
    expect(markers(make_state(doc, 16)).length).toBe(2);
  });

  it('reveals both fences when the caret is in the code body', () => {
    expect(markers(make_state(doc, 9)).length).toBe(0);
  });

  it('reveals both fences when the caret is on the opening fence', () => {
    expect(markers(make_state(doc, 4)).length).toBe(0);
  });

  it('reveals both fences when the caret is on the closing fence', () => {
    expect(markers(make_state(doc, 13)).length).toBe(0);
  });

  it('never emits the collapsed line class (reserved-space hide)', () => {
    for (const d of lines(make_state(doc, 0))) {
      expect(d.class).not.toContain('plainmark-fenced-code-collapsed');
    }
  });

  it('CBLK-E-8: a quoted fence hides only the fence run, leaving the `> ` prefix in flow', () => {
    // '> ```ts'=0..7 (fence run at 2), '> foo'=8..13, '> ```'=14..19 (fence run at 16)
    const m = markers(make_state('> ```ts\n> foo\n> ```\n\nafter', 22));
    expect(m.map((d) => [d.from, d.to])).toEqual([
      [2, 7],
      [16, 19],
    ]);
  });

  it('hides only the opening fence in an unclosed block when outside', () => {
    const m = markers(make_state('a\n```ts\nfoo\n', 0));
    expect(m.length).toBe(1);
    expect(m[0].from).toBe(2);
  });

  it('reveals the opening fence in an unclosed block when the caret is inside', () => {
    expect(markers(make_state('a\n```ts\nfoo\n', 9)).length).toBe(0);
  });
});

describe('fenced code block — selection-driven fence reveal CBLK-I-1 CBLK-I-3', () => {
  // 'a'=0, '```ts'=2..7, 'foo'=8..11, '```'=12..15, 'b'=16; FencedCode node = 2..15
  const doc = 'a\n```ts\nfoo\n```\nb\n';

  it('reveals both fences when the opening fence text is selected', () => {
    expect(markers(make_state_sel(doc, 2, 7)).length).toBe(0);
  });

  it('reveals both fences when the closing fence text is selected', () => {
    expect(markers(make_state_sel(doc, 12, 15)).length).toBe(0);
  });

  it('reveals both fences for a selection inside the code body', () => {
    expect(markers(make_state_sel(doc, 8, 11)).length).toBe(0);
  });

  it('reveals both fences for a selection partially overlapping the block', () => {
    expect(markers(make_state_sel(doc, 0, 9)).length).toBe(0);
  });

  it('reveals both fences for a selection exactly covering the block', () => {
    expect(markers(make_state_sel(doc, 2, 15)).length).toBe(0);
  });

  it('keeps both fences hidden under a strictly-covering selection (select-all)', () => {
    expect(markers(make_state_sel(doc, 0, 16)).length).toBe(2);
  });

  it('keeps both fences hidden for a selection entirely outside the block', () => {
    expect(markers(make_state_sel(doc, 16, 17)).length).toBe(2);
  });
});

describe('fenced code block — unknown language', () => {
  it('renders the raw user info string verbatim on data-language', () => {
    const doc = '```doesnotexist\nfoo\n```\n';
    const state = make_state(doc, 0);
    const out = snapshot(state);

    expect(out[0].data_language).toBe('doesnotexist');
  });

  it('preserves the user raw bytes — `ts` stays `ts`, not canonicalized', () => {
    const doc = '```ts\nfoo\n```\n';
    const state = make_state(doc, 0);
    const out = snapshot(state);
    expect(out[0].data_language).toBe('ts');
  });
});

describe('plainmark_highlight_style THEME-V-5', () => {
  it('maps each syntax tag family onto its --plainmark-syntax-<token> class', () => {
    const families: Array<[Tag, string]> = [
      [tags.keyword, 'keyword'],
      [tags.comment, 'comment'],
      [tags.string, 'string'],
      [tags.number, 'number'],
      [tags.function(tags.variableName), 'function'],
      [tags.variableName, 'variable'],
      [tags.typeName, 'type'],
      [tags.propertyName, 'property'],
      [tags.tagName, 'tag'],
      [tags.meta, 'meta'],
      [tags.punctuation, 'punctuation'],
      [tags.invalid, 'invalid'],
    ];
    for (const [tag, token] of families) {
      expect(plainmark_highlight_style.style([tag]), token).toBe(`plainmark-syntax-${token}`);
    }
  });

  it('leaves tags outside the palette unstyled', () => {
    expect(plainmark_highlight_style.style([tags.emphasis])).toBeNull();
  });
});

function chrome_lines(
  state: EditorState,
): Array<{ from: number; cls: string; style?: string }> {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    registry,
  );
  const out: Array<{ from: number; cls: string; style?: string }> = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    if (from !== to) return;
    const spec = deco.spec as { class?: string; attributes?: Record<string, string> };
    out.push({ from, cls: spec.class ?? '', style: spec.attributes?.style });
  });
  out.sort((a, b) => a.from - b.from);
  return out;
}

function indent_marks(state: EditorState): Array<{ from: number; to: number }> {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    registry,
  );
  const out: Array<{ from: number; to: number }> = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    const spec = deco.spec as { class?: string; widget?: unknown };
    // The indent hide is the handler's only widgetless, classless replace.
    if (from !== to && !spec.class && !spec.widget) out.push({ from, to });
  });
  out.sort((a, b) => a.from - b.from);
  return out;
}

describe('CBLK-R-17: list-nested fenced code takes content-column geometry', () => {
  it('marks every line of a fence under an ordered item with nested class and depth 1', () => {
    // '1. item'=0..7, '   ```js'=8..16, '   const a = 1;'=17..32, '   ```'=33..39, 'z'=40
    const state = make_state('1. item\n   ```js\n   const a = 1;\n   ```\nz', 40);
    const out = chrome_lines(state);
    expect(out.map((l) => l.from)).toEqual([8, 17, 33]);
    for (const line of out) {
      expect(line.cls).toContain('plainmark-fenced-code-nested');
      expect(line.style).toBe('--plainmark-list-depth: 1');
    }
  });

  it('carries the uncapped depth for a fence nested two list levels down', () => {
    const state = make_state('- a\n  1. b\n     ```js\n     x\n     ```\nz', 38);
    const out = chrome_lines(state);
    expect(out.map((l) => l.from)).toEqual([11, 22, 29]);
    for (const line of out) {
      expect(line.cls).toContain('plainmark-fenced-code-nested');
      expect(line.style).toBe('--plainmark-list-depth: 2');
    }
  });

  it('keeps the header data-language alongside the nested depth style', () => {
    const state = make_state('1. item\n   ```js\n   x\n   ```\nz', 29);
    const out = snapshot(state).filter((d) => d.from === d.to && d.from === 8);
    expect(out).toHaveLength(1);
    expect(out[0].data_language).toBe('js');
    const header = chrome_lines(state)[0];
    expect(header.style).toBe('--plainmark-list-depth: 1');
  });

  it('emits no nested class or depth style on a top-level fence', () => {
    const state = make_state('```js\nconst a = 1;\n```\nz', 24);
    const out = chrome_lines(state);
    expect(out).toHaveLength(3);
    for (const line of out) {
      expect(line.cls).not.toContain('plainmark-fenced-code-nested');
      expect(line.style).toBeUndefined();
    }
  });
});

describe('CBLK-R-18: leading whitespace up to the fence indent is display-hidden', () => {
  it('hides the shared 3-space indent on every line of a list-nested fence', () => {
    const state = make_state('1. item\n   ```js\n   const a = 1;\n   ```\nz', 40);
    expect(indent_marks(state)).toEqual([
      { from: 8, to: 11 },
      { from: 17, to: 20 },
      { from: 33, to: 36 },
    ]);
  });

  it('keeps intentional code indentation past the fence indent visible', () => {
    // '       y = 2' has 7 leading spaces; only the fence's 3 hide.
    const state = make_state('1. a\n   ```py\n   x = 1\n       y = 2\n   ```\nz', 44);
    expect(indent_marks(state)).toContainEqual({ from: 23, to: 26 });
  });

  it('hides only what is there on an under-indented content line', () => {
    // ' x' has one leading space against a 2-space fence indent (top-level
    // fence: inside a list an under-indented line ends the item and the fence).
    const state = make_state('  ```js\n x\n  ```\nz', 18);
    expect(indent_marks(state)).toContainEqual({ from: 8, to: 9 });
  });

  it('emits no mark for a blank or flush-left content line', () => {
    // blank line at 14, flush 'x' at 15..16 — neither may carry a mark.
    const state = make_state('1. a\n   ```js\n\nx\n   ```\nz', 24);
    expect(indent_marks(state)).toEqual([
      { from: 5, to: 8 },
      { from: 17, to: 20 },
    ]);
  });

  it('applies the strip to a top-level indented fence without list geometry', () => {
    const state = make_state('  ```js\n  const a = 1;\n  ```\nz', 30);
    for (const line of chrome_lines(state)) {
      expect(line.cls).not.toContain('plainmark-fenced-code-nested');
    }
    expect(indent_marks(state)).toEqual([
      { from: 0, to: 2 },
      { from: 8, to: 10 },
      { from: 23, to: 25 },
    ]);
  });

  it('counts the fence indent in columns: a tab hides only when its full advance fits', () => {
    // 2-space fence: the tab on line 2 spans 4 columns, so it stays visible.
    // '  ```js'=0..7, '\tx'=8..10, '  ```'=11..16, 'z'=17
    const state = make_state('  ```js\n\tx\n  ```\nz', 18);
    expect(indent_marks(state)).toEqual([
      { from: 0, to: 2 },
      { from: 11, to: 13 },
    ]);
  });

  it('hides a tab that fits a 4-column fence indent', () => {
    // '1. a'=0..4, '    ```js'=5..14, '\tx'=15..17, '    ```'=18..25, 'z'=26
    const state = make_state('1. a\n    ```js\n\tx\n    ```\nz', 26);
    expect(indent_marks(state)).toEqual([
      { from: 5, to: 9 },
      { from: 15, to: 16 },
      { from: 18, to: 22 },
    ]);
  });

  it('emits no indent marks for a flush top-level fence', () => {
    const state = make_state('```js\nconst a = 1;\n```\nz', 24);
    expect(indent_marks(state)).toEqual([]);
  });

  it('keeps indent marks and nested lines while the caret is inside the block', () => {
    const state = make_state('1. item\n   ```js\n   const a = 1;\n   ```\nz', 22);
    expect(markers(state)).toHaveLength(0);
    expect(indent_marks(state)).toHaveLength(3);
    for (const line of chrome_lines(state)) {
      expect(line.cls).toContain('plainmark-fenced-code-nested');
    }
  });
});

describe('CBLK-E-8: quote-nested fenced code keeps quote geometry', () => {
  it('emits no nested class and no indent marks inside a blockquote', () => {
    const state = make_state('> ```js\n> const a = 1;\n> ```\nz', 30);
    const out = chrome_lines(state);
    expect(out.map((line) => line.from)).toEqual([0, 8, 23]);
    for (const line of out) {
      expect(line.cls).not.toContain('plainmark-fenced-code-nested');
      expect(line.style).toBeUndefined();
    }
    expect(indent_marks(state)).toEqual([]);
  });

  it('emits no nested class for a fence in a list inside a blockquote', () => {
    const state = make_state('> - a\n>   ```js\n>   x\n>   ```\nz', 31);
    for (const line of chrome_lines(state)) {
      expect(line.cls).not.toContain('plainmark-fenced-code-nested');
    }
    expect(indent_marks(state)).toEqual([]);
  });
});
