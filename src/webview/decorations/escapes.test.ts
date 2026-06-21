import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { escape_handlers } from './escapes.js';
import { build_inline_decorations, build_registry } from './inline_decorations.js';

function make_state(doc: string, anchor: number, head: number = anchor): EditorState {
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
}

const registry = build_registry(escape_handlers);

function snapshot(state: EditorState): DecoSnapshot[] {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    registry,
  );
  const out: DecoSnapshot[] = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    out.push({ from, to, class: (deco.spec as { class?: string }).class });
  });
  out.sort((a, b) => a.from - b.from || a.to - b.to);
  return out;
}

const hide = (from: number): DecoSnapshot => ({
  from,
  to: from + 1,
  class: 'plainmark-inline-marker-hidden',
});

// CommonMark escapable set (lezer-markdown `Escapable`).
const ESCAPABLE = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

describe('ESC-R-1 ESC-I-2: backslash hiding for an off-construct caret', () => {
  // doc: `cost is \$50` + bare line 2 to park the caret off-line
  const doc = 'cost is \\$50\nzz\n';

  it('hides only the backslash byte when the caret is on another line', () => {
    const state = make_state(doc, 14);
    expect(snapshot(state)).toEqual([hide(8)]);
  });

  it('keeps the backslash hidden when the caret is on the line but off the escape', () => {
    const state = make_state(doc, 0);
    expect(snapshot(state)).toEqual([hide(8)]);
  });

  it('emits no decoration over the escaped character itself', () => {
    const state = make_state(doc, 14);
    const decos = snapshot(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].to).toBe(9);
  });
});

describe('ESC-R-2: every CommonMark-escapable character is hidden, not just $', () => {
  for (const ch of ESCAPABLE) {
    it(`hides the backslash of ${JSON.stringify('\\' + ch)}`, () => {
      const doc = `a \\${ch} b\nzz\n`;
      const state = make_state(doc, doc.length - 1);
      expect(snapshot(state)).toEqual([hide(2)]);
    });
  }
});

describe('ESC-R-4: backslash before a non-escapable character is untouched', () => {
  it('emits no decoration for \\a, \\1, or path-style backslashes', () => {
    const doc = 'see \\a \\1 C:\\Users\\name\nzz\n';
    const state = make_state(doc, doc.length - 1);
    expect(snapshot(state)).toEqual([]);
  });
});

describe('ESC-I-1 ESC-I-2: node-scoped reveal', () => {
  // `pay \$5 now` — Escape node at [4,6)
  const doc = 'pay \\$5 now\nzz\n';

  it('reveals when the caret is between the backslash and the escaped char', () => {
    const state = make_state(doc, 5);
    expect(snapshot(state)).toEqual([]);
  });

  it('reveals when the caret touches the opening boundary', () => {
    const state = make_state(doc, 4);
    expect(snapshot(state)).toEqual([]);
  });

  it('reveals when the caret touches the closing boundary', () => {
    const state = make_state(doc, 6);
    expect(snapshot(state)).toEqual([]);
  });

  it('stays hidden for a caret elsewhere on the same line', () => {
    const state = make_state(doc, 9);
    expect(snapshot(state)).toEqual([hide(4)]);
  });

  it('restores hiding after the caret leaves the escape', () => {
    let state = make_state(doc, 5);
    expect(snapshot(state)).toEqual([]);
    state = state.update({ selection: { anchor: 13 } }).state;
    expect(snapshot(state)).toEqual([hide(4)]);
  });

  it('keeps the backslash hidden under a selection strictly covering the escape on both sides', () => {
    const state = make_state(doc, 0, doc.indexOf('\n'));
    expect(snapshot(state)).toEqual([hide(4)]);
  });
});

describe('ESC-I-3: multiple escapes hide and reveal independently', () => {
  // `\$5 and \$10` — Escape nodes at [0,2) and [8,10)
  const doc = '\\$5 and \\$10\nzz\n';

  it('hides both when the caret is off both', () => {
    const state = make_state(doc, 14);
    expect(snapshot(state)).toEqual([hide(0), hide(8)]);
  });

  it('reveals only the escape under the caret', () => {
    const state = make_state(doc, 1);
    expect(snapshot(state)).toEqual([hide(8)]);
  });
});

describe('ESC-E-1: escaped backslash', () => {
  it('hides the first backslash of \\\\ and keeps the second visible', () => {
    const doc = 'a \\\\ b\nzz\n';
    const state = make_state(doc, doc.length - 1);
    expect(snapshot(state)).toEqual([hide(2)]);
  });
});

describe('ESC-E-2: code spans are verbatim', () => {
  it('emits no decoration for a backslash-dollar inside inline code', () => {
    const doc = '`\\$` inline code\nzz\n';
    const state = make_state(doc, doc.length - 1);
    expect(snapshot(state)).toEqual([]);
  });

  it('emits no decoration inside a fenced code block', () => {
    const doc = '```\n\\$50\n```\nzz\n';
    const state = make_state(doc, doc.length - 1);
    expect(snapshot(state)).toEqual([]);
  });
});

describe('ESC-E-3: hard breaks are not escapes', () => {
  it('emits no decoration for a backslash before a newline', () => {
    const doc = 'hard break\\\nnext line\n';
    const state = make_state(doc, doc.length - 1);
    expect(snapshot(state)).toEqual([]);
  });
});

describe('ESC-E-4: escapes nested inside other inline constructs', () => {
  it('hides the backslash inside strong emphasis', () => {
    // `**price \$5**` — Escape at [8,10)
    const doc = '**price \\$5**\nzz\n';
    const state = make_state(doc, doc.length - 1);
    expect(snapshot(state)).toEqual([hide(8)]);
  });

  it('hides the backslash inside a heading', () => {
    // `# heading \$5` — Escape at [10,12)
    const doc = '# heading \\$5\nzz\n';
    const state = make_state(doc, doc.length - 1);
    expect(snapshot(state)).toEqual([hide(10)]);
  });

  it('hides the backslash inside a blockquote line', () => {
    // `> pay \$5` — Escape at [6,8)
    const doc = '> pay \\$5\nzz\n';
    const state = make_state(doc, doc.length - 1);
    expect(snapshot(state)).toEqual([hide(6)]);
  });
});

describe('ESC-E-5: escaped dollars never become math', () => {
  it('hides every backslash in a multi-escape currency line with no math node', () => {
    // The screenshot regression: `\$50/MWh vs \$80/MWh` must render as
    // literal dollars with all backslashes hidden.
    const doc = '\\$50/MWh vs \\$80/MWh\nzz\n';
    const state = make_state(doc, doc.length - 1);
    expect(snapshot(state)).toEqual([hide(0), hide(12)]);
  });
});
