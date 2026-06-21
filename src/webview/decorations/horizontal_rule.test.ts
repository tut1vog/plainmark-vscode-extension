import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { horizontal_rule_handlers } from './horizontal_rule.js';
import { build_inline_decorations, build_registry } from './inline_decorations.js';

function make_state(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor: 0 },
  });
}

interface DecoSnapshot {
  from: number;
  to: number;
  kind: 'line';
  class: string | undefined;
}

const registry = build_registry(horizontal_rule_handlers);

function snapshot(state: EditorState): DecoSnapshot[] {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    registry,
  );
  const out: DecoSnapshot[] = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    const cls = (deco.spec as { class?: string }).class;
    out.push({ from, to, kind: 'line', class: cls });
  });
  return out;
}

const hr = (from: number): DecoSnapshot => ({
  from,
  to: from,
  kind: 'line',
  class: 'plainmark-hr plainmark-collapse-adjacent',
});

describe('horizontal rule', () => {
  it('HR-R-1: renders a line decoration for `---`', () => {
    expect(snapshot(make_state('---\n'))).toEqual([hr(0)]);
  });

  it('HR-R-2: renders a line decoration for `***`', () => {
    expect(snapshot(make_state('***\n'))).toEqual([hr(0)]);
  });

  it('HR-R-2: renders a line decoration for `___`', () => {
    expect(snapshot(make_state('___\n'))).toEqual([hr(0)]);
  });
});
