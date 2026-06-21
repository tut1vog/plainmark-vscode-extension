import { markdown } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import {
  build_inline_decorations,
  build_registry,
  compute_reveal_ranges,
  type NodeHandler,
} from './inline_decorations.js';

function make_state(doc: string, anchor: number = doc.length, head?: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor, head: head ?? anchor },
  });
}

interface ProbeCall {
  name: string;
  from: number;
  to: number;
  revealed: boolean;
}

function make_probe(nodeNames: readonly string[]): {
  handler: NodeHandler;
  calls: ProbeCall[];
} {
  const calls: ProbeCall[] = [];
  const handler: NodeHandler = {
    nodeNames,
    handle(node, _state, revealed) {
      calls.push({ name: node.name, from: node.from, to: node.to, revealed });
      return [Decoration.mark({ class: 'probe' }).range(node.from, node.to)];
    },
  };
  return { handler, calls };
}

function full_range(state: EditorState): { from: number; to: number }[] {
  return [{ from: 0, to: state.doc.length }];
}

function deco_ranges(state: EditorState, handlers: NodeHandler[]): { from: number; to: number }[] {
  const set = build_inline_decorations(state, full_range(state), build_registry(handlers));
  const out: { from: number; to: number }[] = [];
  set.between(0, state.doc.length, (from, to) => {
    out.push({ from, to });
  });
  return out;
}

describe('compute_reveal_ranges MRS-R-6 MRS-R-7', () => {
  it('expands a mid-line cursor to the whole line', () => {
    const doc = 'first line\nsecond line\n';
    const state = make_state(doc, 'first '.length);
    expect(compute_reveal_ranges(state)).toEqual([{ from: 0, to: 'first line'.length }]);
  });

  it('expands a multi-line selection to span all touched lines', () => {
    const doc = 'aaa\nbbb\nccc\n';
    // selection from inside line 1 to inside line 3
    const state = make_state(doc, 1, 9);
    expect(compute_reveal_ranges(state)).toEqual([{ from: 0, to: 11 }]);
  });

  it('assigns a cursor at a line boundary to the line ending there', () => {
    const doc = 'ab\ncd\n';
    // position 2 is the end of line 1 (the \n sits at index 2)
    const state = make_state(doc, 2);
    expect(compute_reveal_ranges(state)).toEqual([{ from: 0, to: 2 }]);
  });

  it('assigns a cursor at the start of a line to that line', () => {
    const doc = 'ab\ncd\n';
    const state = make_state(doc, 3);
    expect(compute_reveal_ranges(state)).toEqual([{ from: 3, to: 5 }]);
  });

  it('returns one reveal range per selection range', () => {
    const doc = 'aaa\nbbb\nccc\n';
    const state = EditorState.create({
      doc,
      extensions: [
        markdown({ extensions: [GFM] }),
        EditorState.allowMultipleSelections.of(true),
      ],
      selection: EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.cursor(9),
      ]),
    });
    expect(compute_reveal_ranges(state)).toEqual([
      { from: 0, to: 3 },
      { from: 8, to: 11 },
    ]);
  });
});

describe('build_registry', () => {
  it('indexes a handler under every node name it claims', () => {
    const handler: NodeHandler = { nodeNames: ['Emphasis', 'StrongEmphasis'], handle: () => [] };
    const registry = build_registry([handler]);
    expect(registry.get('Emphasis')).toEqual([handler]);
    expect(registry.get('StrongEmphasis')).toEqual([handler]);
  });

  it('keeps multiple handlers sharing a node name, in registration order', () => {
    const first: NodeHandler = { nodeNames: ['Blockquote'], handle: () => [] };
    const second: NodeHandler = { nodeNames: ['Blockquote'], handle: () => [] };
    expect(build_registry([first, second]).get('Blockquote')).toEqual([first, second]);
  });

  it('produces an empty registry for an empty handler list', () => {
    expect(build_registry([]).size).toBe(0);
  });
});

describe('build_inline_decorations — dispatch routing', () => {
  it('dispatches a matching node to its handler with the node range', () => {
    const state = make_state('a **bold** b\n', 0);
    const { handler, calls } = make_probe(['StrongEmphasis']);
    build_inline_decorations(state, full_range(state), build_registry([handler]));
    expect(calls).toHaveLength(1);
    expect(state.doc.sliceString(calls[0].from, calls[0].to)).toBe('**bold**');
  });

  it('does not call a handler whose node name is absent from the document', () => {
    const state = make_state('plain text only\n', 0);
    const { handler, calls } = make_probe(['StrongEmphasis']);
    build_inline_decorations(state, full_range(state), build_registry([handler]));
    expect(calls).toHaveLength(0);
  });

  it('marks a node revealed when the selection sits on its line', () => {
    const state = make_state('a **bold** b\n', 3);
    const { handler, calls } = make_probe(['StrongEmphasis']);
    build_inline_decorations(state, full_range(state), build_registry([handler]));
    expect(calls).toHaveLength(1);
    expect(calls[0].revealed).toBe(true);
  });

  it('marks a node not revealed when the selection is on another line', () => {
    const state = make_state('a **bold** b\nsecond line\n', 'a **bold** b\n'.length + 2);
    const { handler, calls } = make_probe(['StrongEmphasis']);
    build_inline_decorations(state, full_range(state), build_registry([handler]));
    expect(calls).toHaveLength(1);
    expect(calls[0].revealed).toBe(false);
  });

  it('only visits nodes inside the supplied visible ranges', () => {
    const doc = '**one**\n\n**two**\n';
    const state = make_state(doc, 0);
    const { handler, calls } = make_probe(['StrongEmphasis']);
    const first_para_end = doc.indexOf('\n');
    build_inline_decorations(state, [{ from: 0, to: first_para_end }], build_registry([handler]));
    expect(calls).toHaveLength(1);
    expect(state.doc.sliceString(calls[0].from, calls[0].to)).toBe('**one**');
  });

  it('invokes every handler registered for a shared node name', () => {
    const state = make_state('a **bold** b\n', 0);
    const first = make_probe(['StrongEmphasis']);
    const second = make_probe(['StrongEmphasis']);
    build_inline_decorations(
      state,
      full_range(state),
      build_registry([first.handler, second.handler]),
    );
    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(1);
  });
});

describe('build_inline_decorations — RangeSet assembly', () => {
  it('includes the ranges a handler returns in the resulting DecorationSet', () => {
    const state = make_state('a **bold** b\n', 0);
    const { handler } = make_probe(['StrongEmphasis']);
    const ranges = deco_ranges(state, [handler]);
    expect(ranges).toHaveLength(1);
    expect(state.doc.sliceString(ranges[0].from, ranges[0].to)).toBe('**bold**');
  });

  it('returns an empty DecorationSet when no handlers are registered', () => {
    const state = make_state('a **bold** b\n', 0);
    expect(deco_ranges(state, [])).toEqual([]);
  });

  it('assembles ranges from multiple matching nodes in document order', () => {
    const state = make_state('**one** and **two**\n', 0);
    const { handler } = make_probe(['StrongEmphasis']);
    const ranges = deco_ranges(state, [handler]);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].from).toBeLessThan(ranges[1].from);
    expect(state.doc.sliceString(ranges[0].from, ranges[0].to)).toBe('**one**');
    expect(state.doc.sliceString(ranges[1].from, ranges[1].to)).toBe('**two**');
  });
});
