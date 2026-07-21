import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import {
  ImagePreviewWidget,
  ImageWidget,
  image_base_field,
  image_widgets_field,
  resolve_image_url,
  set_image_base_effect,
} from './image.js';

const base = 'https://example.com/notes/';

function make_state(doc: string, image_base: string | null = base): EditorState {
  let state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] }), image_base_field, image_widgets_field],
    // Default the cursor to end-of-doc so it does not sit on top of an
    // image-only paragraph at the start of the doc (cursor-on-line reveal).
    selection: { anchor: doc.length },
  });
  if (image_base !== null) {
    state = state.update({ effects: set_image_base_effect.of(image_base) }).state;
  }
  return state;
}

interface DecoSnapshot {
  from: number;
  to: number;
  block: boolean;
  widget: ImageWidget;
}

function decorations(state: EditorState): DecoSnapshot[] {
  const out: DecoSnapshot[] = [];
  state.field(image_widgets_field).between(0, state.doc.length, (from, to, deco) => {
    const w = (deco.spec as { widget?: unknown }).widget;
    if (w instanceof ImageWidget) {
      out.push({ from, to, block: deco.spec.block === true, widget: w });
    }
  });
  return out;
}

interface PreviewSnapshot {
  from: number;
  to: number;
  side: number;
  widget: ImagePreviewWidget;
}

function previews(state: EditorState): PreviewSnapshot[] {
  const out: PreviewSnapshot[] = [];
  state.field(image_widgets_field).between(0, state.doc.length, (from, to, deco) => {
    const w = (deco.spec as { widget?: unknown }).widget;
    if (w instanceof ImagePreviewWidget) {
      out.push({ from, to, side: deco.spec.side as number, widget: w });
    }
  });
  return out;
}

describe('resolve_image_url IMG-R-7', () => {
  it('passes http URLs through unchanged', () => {
    expect(resolve_image_url('http://example.com/x.png', base)).toBe('http://example.com/x.png');
  });

  it('passes https URLs through unchanged', () => {
    expect(resolve_image_url('https://example.com/x.png', base)).toBe('https://example.com/x.png');
  });

  it('resolves relative paths against the base', () => {
    expect(resolve_image_url('./cover.png', base)).toBe(`${base}cover.png`);
    expect(resolve_image_url('cover.png', base)).toBe(`${base}cover.png`);
    expect(resolve_image_url('../assets/cover.png', base)).toBe('https://example.com/assets/cover.png');
  });

  it('returns null for relative paths when base is null', () => {
    expect(resolve_image_url('./cover.png', null)).toBeNull();
    expect(resolve_image_url('cover.png', null)).toBeNull();
  });

  it('still resolves http(s) when base is null', () => {
    expect(resolve_image_url('https://example.com/x.png', null)).toBe('https://example.com/x.png');
  });
});

describe('ImageWidget.eq IMG-E-7', () => {
  it('returns true when alt, url, and resolved_src all match', () => {
    const a = new ImageWidget('alt', 'cover.png', `${base}cover.png`);
    const b = new ImageWidget('alt', 'cover.png', `${base}cover.png`);
    expect(a.eq(b)).toBe(true);
  });

  it('returns false when alt differs', () => {
    const a = new ImageWidget('alt1', 'cover.png', `${base}cover.png`);
    const b = new ImageWidget('alt2', 'cover.png', `${base}cover.png`);
    expect(a.eq(b)).toBe(false);
  });

  it('returns false when url differs', () => {
    const a = new ImageWidget('alt', 'cover.png', `${base}cover.png`);
    const b = new ImageWidget('alt', 'other.png', `${base}other.png`);
    expect(a.eq(b)).toBe(false);
  });

  it('returns false when resolved_src differs (base changed)', () => {
    const a = new ImageWidget('alt', 'cover.png', `${base}cover.png`);
    const b = new ImageWidget('alt', 'cover.png', 'https://other.example/dir/cover.png');
    expect(a.eq(b)).toBe(false);
  });
});

describe('image_widgets_field — decoration emission', () => {
  it('IMG-R-2 IMG-R-5 IMG-R-6: emits a block decoration for an image-only paragraph', () => {
    const state = make_state('![alt](cover.png)\n');
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].from).toBe(0);
    expect(decos[0].to).toBe('![alt](cover.png)'.length);
    expect(decos[0].block).toBe(true);
    expect(decos[0].widget.alt).toBe('alt');
    expect(decos[0].widget.url).toBe('cover.png');
    expect(decos[0].widget.resolved_src).toBe(`${base}cover.png`);
  });

  it('IMG-R-6: strips the angle brackets from an `![alt](<a b.png>)` destination', () => {
    // CommonMark angle-bracket destination — the only way to write a spaced
    // path; the lezer URL node includes the `<`/`>`, the effective url must not.
    const state = make_state('![alt](<img a.png>)\n');
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].widget.url).toBe('img a.png');
    // `new URL` percent-encodes the space; the webview resource server decodes
    // it back to the on-disk name.
    expect(decos[0].widget.resolved_src).toBe(`${base}img%20a.png`);
  });

  it('IMG-E-1: skips lines that mix image with text on the SAME line', () => {
    expect(decorations(make_state('Hello ![alt](cover.png) world\n'))).toHaveLength(0);
  });

  it('IMG-R-2 (ADR-0013): promotes an image line directly below a text line', () => {
    // Lazy continuation: one Paragraph node — the image line still promotes,
    // scoped to its own line range.
    const doc = 'some text\n![alt](cover.png)\n';
    const decos = decorations(make_state(doc));
    expect(decos).toHaveLength(1);
    expect(decos[0].from).toBe('some text\n'.length);
    expect(decos[0].to).toBe(doc.length - 1);
    expect(decos[0].widget.url).toBe('cover.png');
  });

  it('IMG-R-2 (ADR-0013): promotes an image line directly above a text line', () => {
    const decos = decorations(make_state('![alt](cover.png)\nsome text\n'));
    expect(decos).toHaveLength(1);
    expect(decos[0].from).toBe(0);
    expect(decos[0].to).toBe('![alt](cover.png)'.length);
  });

  it('IMG-E-2: skips lines with multiple images on the SAME line', () => {
    expect(decorations(make_state('![a](1.png) ![b](2.png)\n'))).toHaveLength(0);
  });

  it('IMG-E-2 (ADR-0013): adjacent image-only lines in one paragraph each promote', () => {
    const decos = decorations(make_state('![a](1.png)\n![b](2.png)\n\nend'));
    expect(decos).toHaveLength(2);
    expect(decos[0].widget.url).toBe('1.png');
    expect(decos[1].widget.url).toBe('2.png');
  });

  it('IMG-R-3: skips images inside list items (paragraph not a direct child of Document)', () => {
    expect(decorations(make_state('- ![alt](cover.png)\n'))).toHaveLength(0);
  });

  it('IMG-R-3: skips images inside blockquotes', () => {
    expect(decorations(make_state('> ![alt](cover.png)\n'))).toHaveLength(0);
  });

  it('IMG-R-10: emits decorations for multiple image-only paragraphs', () => {
    const state = make_state('![a](1.png)\n\n![b](2.png)\n');
    const decos = decorations(state);
    expect(decos).toHaveLength(2);
    expect(decos[0].widget.url).toBe('1.png');
    expect(decos[1].widget.url).toBe('2.png');
  });

  it('IMG-I-1 IMG-I-2 IMG-I-11: swaps the replace widget for an in-flow preview on cursor-on-line reveal', () => {
    let state = make_state('![alt](cover.png)\n');
    expect(decorations(state)).toHaveLength(1);
    expect(previews(state)).toHaveLength(0);
    state = state.update({ selection: { anchor: 3 } }).state;
    expect(decorations(state)).toHaveLength(0);
    const p = previews(state);
    expect(p).toHaveLength(1);
    // Anchored at the image line's end, below the revealed source (side: 1).
    expect(p[0].from).toBe('![alt](cover.png)'.length);
    expect(p[0].side).toBe(1);
    expect(p[0].widget.resolved_src).toBe(`${base}cover.png`);
  });

  it('IMG-I-1 (ADR-0013): reveal is keyed to the image LINE — caret on a sibling text line keeps the widget', () => {
    const doc = 'some text\n![alt](cover.png)\n';
    const state = make_state(doc).update({ selection: { anchor: 3 } }).state;
    expect(decorations(state)).toHaveLength(1);
    expect(previews(state)).toHaveLength(0);
  });

  it('IMG-R-7 IMG-I-11: an unresolvable URL emits no preview either', () => {
    const state = make_state('![alt](cover.png)\n', null).update({
      selection: { anchor: 3 },
    }).state;
    expect(decorations(state)).toHaveLength(0);
    expect(previews(state)).toHaveLength(0);
  });

  it('IMG-E-9: omits decoration for relative URLs when the base is null', () => {
    expect(decorations(make_state('![alt](cover.png)\n', null))).toHaveLength(0);
  });

  it('IMG-E-9: still emits decoration for http(s) URLs when the base is null', () => {
    const state = make_state('![alt](https://example.com/x.png)\n', null);
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].widget.resolved_src).toBe('https://example.com/x.png');
  });

  it('IMG-E-7 IMG-I-2: rebuilds decorations when the base changes', () => {
    let state = make_state('![alt](cover.png)\n');
    expect(decorations(state)[0].widget.resolved_src).toBe(`${base}cover.png`);
    state = state.update({
      effects: set_image_base_effect.of('https://other.example/dir/'),
    }).state;
    expect(decorations(state)[0].widget.resolved_src).toBe('https://other.example/dir/cover.png');
  });

  it('exports Decoration (sanity ref so static analyzers do not drop the import)', () => {
    expect(typeof Decoration.replace).toBe('function');
  });
});
