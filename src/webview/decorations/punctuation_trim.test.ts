import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { build_inline_decorations, build_registry } from './inline_decorations.js';
import { link_handlers } from './links.js';
import { merge_runs, PUNCTUATION_TRIM_CLASS } from './punctuation_trim.js';
import { text_style_handlers } from './text_styles.js';

const registry = build_registry([...text_style_handlers, ...link_handlers]);

// Caret parked on the trailing bare line so every construct stays hidden.
function trims(doc: string, revealed = false): string[] {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor: revealed ? 0 : doc.length },
  });
  const out: string[] = [];
  build_inline_decorations(state, [{ from: 0, to: doc.length }], registry).between(
    0,
    doc.length,
    (from, to, deco) => {
      if ((deco.spec as { class?: string }).class === PUNCTUATION_TRIM_CLASS) {
        out.push(`${from}:${doc.slice(from, to)}`);
      }
    },
  );
  return out;
}

describe('MRS-R-10: fullwidth punctuation across a hidden marker', () => {
  it('closing before closing trims the character before the marker', () => {
    // `）` at 17, `**` at 18-19, `，` at 20
    expect(trims('**隔离队列（Quarantine）**，同时\nzz\n')).toEqual(['17:）']);
  });

  it('opening after closing or opening trims the character after the marker', () => {
    expect(trims('看，**（注）**\nzz\n')).toEqual(['4:（']);
    expect(trims('看（**（注）**\nzz\n')).toEqual(['4:（']);
  });

  it('closing after opening and non-CJK neighbours trim nothing', () => {
    expect(trims('看（**注）**\nzz\n')).toEqual([]);
    expect(trims('x **bold**, y\nzz\n')).toEqual([]);
    expect(trims('看！**（注）**\nzz\n')).toEqual([]);
  });

  it('a revealed construct trims nothing — its marker is visible text', () => {
    expect(trims('**隔离队列（Quarantine）**，同时\nzz\n', true)).toEqual([]);
  });

  it('contiguous marker runs count as one boundary', () => {
    // `***x）***，` — the `*` and `**` closers abut.
    expect(trims('***x）***，\nzz\n')).toEqual(['4:）']);
  });

  it('a collapsed link tail is a boundary too', () => {
    expect(trims('[见（图）](http://x)，好\nzz\n')).toEqual(['4:）']);
  });
});

describe('merge_runs', () => {
  it('merges abutting and overlapping runs and sorts', () => {
    expect(
      merge_runs([
        { from: 5, to: 6 },
        { from: 0, to: 2 },
        { from: 2, to: 4 },
        { from: 3, to: 5 },
      ]),
    ).toEqual([{ from: 0, to: 6 }]);
  });
});
