import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { math_extension } from '../grammar/math.js';
import {
  build_inline_decorations,
  build_registry,
  type NodeHandler,
} from './inline_decorations.js';

// build_inline_decorations suppresses every handler inside a closed `$$…$$`
// fence pair (inline_decorations.ts): math source dissolved into paragraphs
// (MATH-E-12) must display byte-accurate, so no marker hiding or inline styling
// runs there (MATH-E-14). This exercises that gate directly by recording which
// nodes a probe handler is actually invoked for.

function make_state(doc: string, anchor = 0): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, math_extension] })],
    selection: { anchor },
  });
}

function make_probe(nodeNames: readonly string[]): {
  handler: NodeHandler;
  calls: { from: number; to: number }[];
} {
  const calls: { from: number; to: number }[] = [];
  const handler: NodeHandler = {
    nodeNames,
    handle(node) {
      calls.push({ from: node.from, to: node.to });
      return [Decoration.mark({ class: 'probe' }).range(node.from, node.to)];
    },
  };
  return { handler, calls };
}

function deco_count(state: EditorState, handler: NodeHandler): number {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    build_registry([handler]),
  );
  let n = 0;
  set.between(0, state.doc.length, () => {
    n++;
  });
  return n;
}

describe('build_inline_decorations — math-fence suppression MATH-E-12 MATH-E-14', () => {
  // A `$$` block whose close is preceded by a blank line dissolves into
  // paragraphs (MATH-E-12): `**bold**` inside becomes a real StrongEmphasis
  // node, while `**out**` below the fence is ordinary prose.
  const doc = '$$\n**bold**\n\n$$\n\n**out**\n';

  it('does not invoke a handler for a node inside the closed fence pair', () => {
    const { handler, calls } = make_probe(['StrongEmphasis']);
    build_inline_decorations(
      make_state(doc),
      [{ from: 0, to: doc.length }],
      build_registry([handler]),
    );
    // Only the `**out**` outside the fence reaches the handler.
    expect(calls).toEqual([{ from: doc.indexOf('**out**'), to: doc.indexOf('**out**') + '**out**'.length }]);
  });

  it('emits no decoration inside the fence but one for the node outside it', () => {
    const { handler } = make_probe(['StrongEmphasis']);
    expect(deco_count(make_state(doc), handler)).toBe(1);
  });

  it('control: without the fence, the same node IS decorated (handler is active)', () => {
    // Same StrongEmphasis, no enclosing `$$…$$` pair — suppression must not fire.
    const { handler, calls } = make_probe(['StrongEmphasis']);
    const plain = make_state('**bold**\n');
    build_inline_decorations(plain, [{ from: 0, to: plain.doc.length }], build_registry([handler]));
    expect(calls).toEqual([{ from: 0, to: '**bold**'.length }]);
  });
});
