import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { build_inline_decorations, build_registry } from './inline_decorations.js';
import { list_handlers, toggle_task_marker } from './lists.js';

function make_state(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor },
  });
}

interface DecoSnapshot {
  from: number;
  to: number;
  kind: 'line' | 'mark' | 'replace' | 'widget' | 'bullet';
  class?: string;
  checked?: boolean;
}

const registry = build_registry(list_handlers);

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
      widget?: { checked?: boolean };
    };
    if (spec.widget) {
      if ('checked' in spec.widget) {
        out.push({ from, to, kind: 'widget', checked: spec.widget.checked });
      } else {
        out.push({ from, to, kind: 'bullet' });
      }
    } else if (from === to) {
      out.push({ from, to, kind: 'line', class: spec.class });
    } else if (spec.class === undefined) {
      out.push({ from, to, kind: 'replace' });
    } else {
      out.push({ from, to, kind: 'mark', class: spec.class });
    }
  });
  out.sort(
    (a, b) =>
      a.from - b.from ||
      a.to - b.to ||
      a.kind.localeCompare(b.kind) ||
      (a.class ?? '').localeCompare(b.class ?? ''),
  );
  return out;
}

const line = (from: number, cls: string): DecoSnapshot => ({
  from,
  to: from,
  kind: 'line',
  class: cls,
});
const mark = (from: number, to: number, cls: string): DecoSnapshot => ({
  from,
  to,
  kind: 'mark',
  class: cls,
});
const widget = (from: number, to: number, checked: boolean): DecoSnapshot => ({
  from,
  to,
  kind: 'widget',
  checked,
});
const bullet = (from: number, to: number): DecoSnapshot => ({
  from,
  to,
  kind: 'bullet',
});

function line_depths(state: EditorState): Array<{ from: number; depth: number }> {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    registry,
  );
  const out: Array<{ from: number; depth: number }> = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    if (from !== to) return;
    const style = (deco.spec as { attributes?: { style?: string } }).attributes?.style ?? '';
    const m = /--plainmark-list-depth:\s*(\d+)/.exec(style);
    if (m) out.push({ from, depth: Number(m[1]) });
  });
  return out;
}

function line_buckets(state: EditorState): Array<{ from: number; bucket: string }> {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    registry,
  );
  const out: Array<{ from: number; bucket: string }> = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    if (from !== to) return;
    const attrs = (deco.spec as { attributes?: Record<string, string> }).attributes;
    const bucket = attrs?.['data-list-depth'];
    if (bucket !== undefined) out.push({ from, bucket });
  });
  return out;
}

describe('bullet list LIST-R-1 LIST-R-2 LIST-I-1', () => {
  // '- a\n\nzz\n' — ListItem[0,3]; ListMark[0,1]; bullet widget spans [0,2] (marker + trailing space)
  const doc = '- a\n\nzz\n';
  const caret_off = 6; // on 'zz' line
  const caret_inside = 2; // on the bullet line

  it('replaces the bullet ListMark and its trailing space with a bullet widget when caret is off-line', () => {
    expect(snapshot(make_state(doc, caret_off))).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(0, 2),
    ]);
  });

  it('keeps the bullet widget when the caret is on the line (B2 — the raw marker is never revealed)', () => {
    expect(snapshot(make_state(doc, caret_inside))).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(0, 2),
    ]);
  });

  it('keeps the bullet widget stable across caret enter and leave', () => {
    let state = make_state(doc, caret_inside);
    expect(snapshot(state)).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(0, 2),
    ]);
    state = state.update({ selection: { anchor: caret_off } }).state;
    expect(snapshot(state)).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(0, 2),
    ]);
  });
});

describe('bullet list (`*` and `+` markers) LIST-R-2', () => {
  it('replaces a `*` marker with a bullet widget off-line', () => {
    // '* a\n\nzz\n'
    expect(snapshot(make_state('* a\n\nzz\n', 6))).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(0, 2),
    ]);
  });

  it('replaces a `+` marker with a bullet widget off-line', () => {
    // '+ a\n\nzz\n'
    expect(snapshot(make_state('+ a\n\nzz\n', 6))).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(0, 2),
    ]);
  });
});

describe('lone bullet marker space-gate LIST-R-2 LIST-E-6', () => {
  it('emits no list decorations for a lone `-` (caret on the line, just typed)', () => {
    // '-' parses as an empty ListItem (lezer EOL branch) but must stay plain text.
    expect(snapshot(make_state('-', 1))).toEqual([]);
  });

  it('emits no list decorations for a lone `*` or `+`', () => {
    expect(snapshot(make_state('*', 1))).toEqual([]);
    expect(snapshot(make_state('+', 1))).toEqual([]);
  });

  it('emits no list decorations for a lone `-` even when the caret is elsewhere', () => {
    // '-\n\nzz\n' — caret on the 'zz' line.
    expect(snapshot(make_state('-\n\nzz\n', 4))).toEqual([]);
  });

  it('renders the bullet widget the moment the trailing space exists', () => {
    // '- ' — marker + trailing space, no content yet → bullet spans [0,2].
    expect(snapshot(make_state('- ', 2))).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(0, 2),
    ]);
  });

  it('gates only the lone item, not its siblings', () => {
    // '- a\n-' — first item rendered, the just-typed lone `-` below stays plain text.
    expect(snapshot(make_state('- a\n-', 5))).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(0, 2),
    ]);
  });

  it('gates a lone nested marker without touching the ancestor', () => {
    // '- a\n  -' — outer item rendered, nested lone `-` stays plain text.
    expect(snapshot(make_state('- a\n  -', 7))).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(0, 2),
    ]);
  });
});

describe('ordered list LIST-R-5 LIST-I-2 LIST-E-2', () => {
  // '1. a\n\nzz\n' — ListItem[0,4]; ListMark[0,2] = '1.'
  const doc = '1. a\n\nzz\n';
  const caret_off = 7;
  const caret_inside = 2;

  it('styles the numeric marker as a mark (no widget) when caret is off-line', () => {
    expect(snapshot(make_state(doc, caret_off))).toEqual([
      line(0, 'plainmark-list-item'),
      mark(0, 2, 'plainmark-list-marker'),
    ]);
  });

  it('keeps the numeric marker as a mark when caret is on the line (no reveal branch)', () => {
    expect(snapshot(make_state(doc, caret_inside))).toEqual([
      line(0, 'plainmark-list-item'),
      mark(0, 2, 'plainmark-list-marker'),
    ]);
  });

  it('styles a `)`-delimited ordered marker as a mark', () => {
    // '1) a\n\nzz\n' — ListMark[0,2] = '1)'
    expect(snapshot(make_state('1) a\n\nzz\n', 7))).toEqual([
      line(0, 'plainmark-list-item'),
      mark(0, 2, 'plainmark-list-marker'),
    ]);
  });
});

describe('nested list LIST-R-1 LIST-R-8 LIST-I-1', () => {
  // '- a\n  - b\n\nzz\n'
  // Outer ListItem covers both lines; inner ListItem on line 2 (offset 6).
  const doc = '- a\n  - b\n\nzz\n';
  const caret_off = 11;

  it('emits a line decoration on the first line of each ListItem', () => {
    const decos = snapshot(make_state(doc, caret_off));
    const line_decos = decos.filter((d) => d.kind === 'line');
    expect(line_decos).toEqual([
      line(0, 'plainmark-list-item'),
      line(4, 'plainmark-list-item'),
    ]);
  });

  it('assigns nesting depth 0 to the top-level item and 1 to the nested item', () => {
    expect(line_depths(make_state(doc, caret_off))).toEqual([
      { from: 0, depth: 0 },
      { from: 4, depth: 1 },
    ]);
  });

  it('absorbs the nested item leading whitespace into the bullet widget', () => {
    // inner ListItem: line starts at 4, ListMark[6,7] — widget spans [4,8].
    const decos = snapshot(make_state(doc, caret_off));
    expect(decos).toContainEqual(bullet(0, 2));
    expect(decos).toContainEqual(bullet(4, 8));
  });

  it('keeps the nested item at its computed depth with the bullet widget when the caret is on its line (B2 — bullets never reveal)', () => {
    // caret at offset 6 — the nested item's own marker line.
    const decos = snapshot(make_state(doc, 6));
    const depths = line_depths(make_state(doc, 6));
    expect(depths).toContainEqual({ from: 4, depth: 1 });
    expect(decos).toContainEqual(bullet(4, 8));
    // ancestor stays put — its bullet widget is likewise never revealed.
    expect(depths).toContainEqual({ from: 0, depth: 0 });
    expect(decos).toContainEqual(bullet(0, 2));
  });
});

describe('deeply nested list LIST-R-8', () => {
  // three levels, each indented under the previous
  const doc = '- a\n  - b\n    - c\n\nzz\n';

  it('assigns an incrementing depth to every nesting level', () => {
    expect(line_depths(make_state(doc, 19))).toEqual([
      { from: 0, depth: 0 },
      { from: 4, depth: 1 },
      { from: 10, depth: 2 },
    ]);
  });
});

describe('depth-cycled bullet glyphs LIST-R-3 LIST-E-3', () => {
  it('buckets nesting depth 0 / 1 / 2 to data-list-depth 0 / 1 / 2', () => {
    // '- a\n  - b\n    - c\n\nzz\n' — three levels
    const doc = '- a\n  - b\n    - c\n\nzz\n';
    expect(line_buckets(make_state(doc, 19))).toEqual([
      { from: 0, bucket: '0' },
      { from: 4, bucket: '1' },
      { from: 10, bucket: '2' },
    ]);
  });

  it('caps the bucket at 2 for nesting depth 3 and deeper', () => {
    // '- a\n  - b\n    - c\n      - d\n\nzz\n' — four levels; line 4 is depth 3
    const doc = '- a\n  - b\n    - c\n      - d\n\nzz\n';
    const buckets = line_buckets(make_state(doc, 30));
    expect(buckets).toEqual([
      { from: 0, bucket: '0' },
      { from: 4, bucket: '1' },
      { from: 10, bucket: '2' },
      { from: 18, bucket: '2' },
    ]);
  });
});

describe('task list (unchecked) LIST-R-6 LIST-I-3 LIST-E-4', () => {
  // '- [ ] a\n\nzz\n' — ListMark[0,1]; Task[2,7]; TaskMarker[2,5]
  const doc = '- [ ] a\n\nzz\n';
  const caret_off = 10;
  const caret_inside = 3;

  it('hides the raw `- ` and replaces the TaskMarker with a checkbox widget when off-line', () => {
    expect(snapshot(make_state(doc, caret_off))).toEqual([
      line(0, 'plainmark-list-item'),
      mark(0, 2, 'plainmark-list-marker-hidden'),
      widget(2, 5, false),
    ]);
  });

  it('keeps the checkbox widget when the caret is on the line (task items never reveal)', () => {
    expect(snapshot(make_state(doc, caret_inside))).toEqual([
      line(0, 'plainmark-list-item'),
      mark(0, 2, 'plainmark-list-marker-hidden'),
      widget(2, 5, false),
    ]);
  });

  it('keeps the checkbox widget stable across caret enter and leave', () => {
    let state = make_state(doc, caret_inside);
    expect(snapshot(state)).toEqual([
      line(0, 'plainmark-list-item'),
      mark(0, 2, 'plainmark-list-marker-hidden'),
      widget(2, 5, false),
    ]);
    state = state.update({ selection: { anchor: caret_off } }).state;
    expect(snapshot(state)).toEqual([
      line(0, 'plainmark-list-item'),
      mark(0, 2, 'plainmark-list-marker-hidden'),
      widget(2, 5, false),
    ]);
  });
});

describe('task list (checked) LIST-R-6 LIST-R-7 LIST-I-3', () => {
  // '- [x] a\n\nzz\n'
  const doc = '- [x] a\n\nzz\n';
  const caret_off = 10;
  const caret_inside = 3;

  it('hides the raw `- `, emits a checked widget plus the task-checked line when off-line', () => {
    expect(snapshot(make_state(doc, caret_off))).toEqual([
      line(0, 'plainmark-list-item'),
      line(0, 'plainmark-task-checked'),
      mark(0, 2, 'plainmark-list-marker-hidden'),
      widget(2, 5, true),
    ]);
  });

  it('keeps the checkbox widget and task-checked line when the caret is on the line', () => {
    expect(snapshot(make_state(doc, caret_inside))).toEqual([
      line(0, 'plainmark-list-item'),
      line(0, 'plainmark-task-checked'),
      mark(0, 2, 'plainmark-list-marker-hidden'),
      widget(2, 5, true),
    ]);
  });

  it('also handles capital `[X]`', () => {
    // '- [X] a\n\nzz\n'
    const docX = '- [X] a\n\nzz\n';
    const decos = snapshot(make_state(docX, 10));
    expect(decos.some((d) => d.kind === 'widget' && d.checked === true)).toBe(true);
    expect(decos.some((d) => d.kind === 'line' && d.class === 'plainmark-task-checked')).toBe(
      true,
    );
  });
});

interface FakeView {
  view: EditorView;
  applied: TransactionSpec[];
  doc: () => string;
  anchor: () => number;
  head: () => number;
}

function make_view(initial_doc: string, anchor: number, head?: number): FakeView {
  let state = EditorState.create({
    doc: initial_doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor, head: head ?? anchor },
  });
  const applied: TransactionSpec[] = [];
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      applied.push(spec);
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  return {
    view,
    applied,
    doc: () => state.doc.toString(),
    anchor: () => state.selection.main.anchor,
    head: () => state.selection.main.head,
  };
}

describe('list markers inside a blockquote LIST-R-2 LIST-R-5 LIST-R-6 LIST-R-11 BQ-E-9', () => {
  // The `> ` quote prefix must stay in flow: the transparent QuoteMark span
  // draws the quote's nesting bar (blockquote.ts) and its advance backs the
  // line's hanging indent. A marker hide anchored at line start swallows the
  // prefix — the bar vanishes and the bullet paints at the border column.

  it('(a) starts the bullet replace after the `> ` prefix, not at line start', () => {
    // '> - b\nz\n' — QuoteMark[0,1); ListMark[2,3); bullet spans marker + trailing space
    expect(snapshot(make_state('> - b\nz\n', 7))).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(2, 4),
    ]);
  });

  it('(b) starts the bullet replace after the innermost `> ` in a nested quote', () => {
    // '> > - b\nz\n' — QuoteMark[0,1) and [2,3); ListMark[4,5)
    expect(snapshot(make_state('> > - b\nz\n', 9))).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(4, 6),
    ]);
  });

  it('(c) does not hide the `> ` prefix before an ordered marker', () => {
    // '> 1. a\nz\n' — ListMark[2,4); nothing between prefix end and marker to hide
    expect(snapshot(make_state('> 1. a\nz\n', 8))).toEqual([
      line(0, 'plainmark-list-item'),
      mark(2, 4, 'plainmark-list-marker'),
    ]);
  });

  it('(d) starts the task marker hide after the `> ` prefix', () => {
    // '> - [ ] t\nz\n' — ListMark[2,3); TaskMarker[4,7)
    expect(snapshot(make_state('> - [ ] t\nz\n', 11))).toEqual([
      line(0, 'plainmark-list-item'),
      mark(2, 4, 'plainmark-list-marker-hidden'),
      widget(4, 7, false),
    ]);
  });

  it('(e) keeps the bullet replace tight against a tight `>-` prefix', () => {
    // '>- b\nz\n' — QuoteMark[0,1) with no trailing space; ListMark[1,2)
    expect(snapshot(make_state('>- b\nz\n', 6))).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(1, 3),
    ]);
  });

  it('(f) swallows a nested item’s nesting spaces inside a quote', () => {
    // '> - a\n>   - n\nz\n' — inner ListMark[10,11); the bullet replace covers
    // the nesting spaces [8,10) plus the marker, like an unquoted nested item:
    // the nesting step is depth-driven (marker margin + quote indent units),
    // not source-space-driven, so it matches unquoted list geometry.
    expect(snapshot(make_state('> - a\n>   - n\nz\n', 15))).toEqual([
      line(0, 'plainmark-list-item'),
      bullet(2, 4),
      line(6, 'plainmark-list-item'),
      bullet(8, 12),
    ]);
  });
});

describe('toggle_task_marker LIST-I-10 LIST-SP-3', () => {
  it('(a) toggles unchecked `[ ]` to `[x]` with a single transaction', () => {
    // '- [ ] a\n' — TaskMarker at offset 2..5
    const { view, applied, doc } = make_view('- [ ] a\n', 0);
    expect(toggle_task_marker(view, 2)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('- [x] a\n');
    const spec = applied[0] as { changes?: { from: number; to: number; insert: string } };
    expect(spec.changes).toEqual({ from: 3, to: 4, insert: 'x' });
  });

  it('(b) toggles checked `[x]` back to `[ ]` with a single transaction', () => {
    const { view, applied, doc } = make_view('- [x] a\n', 0);
    expect(toggle_task_marker(view, 2)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('- [ ] a\n');
  });

  it("(b') canonicalizes capital `[X]` to `[ ]` on uncheck", () => {
    const { view, applied, doc } = make_view('- [X] a\n', 0);
    expect(toggle_task_marker(view, 2)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('- [ ] a\n');
  });

  it('(c) preserves selection anchor/head across toggle', () => {
    const { view, anchor, head } = make_view('- [ ] a\n', 6);
    expect(toggle_task_marker(view, 2)).toBe(true);
    expect(anchor()).toBe(6);
    expect(head()).toBe(6);
  });

  it('(d) returns false at a position outside any TaskMarker', () => {
    const { view, applied } = make_view('- [ ] a\n', 0);
    expect(toggle_task_marker(view, 0)).toBe(false);
    expect(applied).toHaveLength(0);
  });
});
