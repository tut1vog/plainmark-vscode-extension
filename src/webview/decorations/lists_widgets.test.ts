import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { build_inline_decorations, build_registry } from './inline_decorations.js';
import { list_handlers } from './lists.js';

// ListBulletWidget and TaskCheckboxWidget are private to lists.ts, so we reach
// their real instances the way CM6 does: through the decorations the list
// handlers emit. Each doc below produces exactly one widget.
interface WidgetLike {
  eq(other?: unknown): boolean;
  ignoreEvent(): boolean;
  checked?: boolean;
}

function list_widgets(doc: string): WidgetLike[] {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor: 0 },
  });
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    build_registry(list_handlers),
  );
  const out: WidgetLike[] = [];
  set.between(0, state.doc.length, (_from, _to, deco) => {
    const w = (deco.spec as { widget?: WidgetLike }).widget;
    if (w) out.push(w);
  });
  return out;
}

describe('ListBulletWidget.eq LIST-R-4', () => {
  it('is a stateless singleton — eq is always true (no per-widget depth/glyph state)', () => {
    const [bullet] = list_widgets('- item\n');
    expect(bullet.eq()).toBe(true);
    // The impl ignores its comparand; equality holds regardless of what it is
    // compared against, so depth-cycling rides the line attribute, not the widget.
    expect(bullet.eq({})).toBe(true);
    const [other] = list_widgets('  - nested\n');
    expect(bullet.eq(other)).toBe(true);
  });
});

describe('ListBulletWidget.ignoreEvent — a click must place the caret', () => {
  it('returns false so the bullet does not swallow pointer events', () => {
    const [bullet] = list_widgets('- item\n');
    expect(bullet.ignoreEvent()).toBe(false);
  });
});

describe('TaskCheckboxWidget.ignoreEvent — the checkbox owns its own click', () => {
  it('returns true for an unchecked checkbox', () => {
    const [checkbox] = list_widgets('- [ ] todo\n');
    expect(checkbox.checked).toBe(false);
    expect(checkbox.ignoreEvent()).toBe(true);
  });

  it('returns true for a checked checkbox', () => {
    const [checkbox] = list_widgets('- [x] done\n');
    expect(checkbox.checked).toBe(true);
    expect(checkbox.ignoreEvent()).toBe(true);
  });
});
