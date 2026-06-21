import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { GFM } from '@lezer/markdown';
import type { SyntaxNode } from '@lezer/common';
import { describe, expect, it } from 'vitest';
import { detect_callout, synthesize_title } from './callout_detect.js';

function make_state(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
  });
}

function first_blockquote(state: EditorState): SyntaxNode {
  let found: SyntaxNode | null = null;
  syntaxTree(state).iterate({
    enter(node) {
      if (found) return false;
      if (node.name === 'Blockquote') {
        found = node.node;
        return false;
      }
      return undefined;
    },
  });
  if (!found) throw new Error('no Blockquote node');
  return found;
}

function detect(doc: string) {
  const state = make_state(doc);
  return detect_callout(state, first_blockquote(state));
}

describe('detect_callout — GFM-5 canonical types CALL-R-1 CALL-R-2', () => {
  it('recognizes [!NOTE]', () => {
    const info = detect('> [!NOTE]\n> body');
    expect(info?.type).toBe('note');
    expect(info?.title).toBeNull();
    expect(info?.fold).toBeNull();
  });

  it('recognizes [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]', () => {
    expect(detect('> [!TIP]')?.type).toBe('tip');
    expect(detect('> [!IMPORTANT]')?.type).toBe('important');
    expect(detect('> [!WARNING]')?.type).toBe('warning');
    expect(detect('> [!CAUTION]')?.type).toBe('caution');
  });
});

describe('detect_callout — case insensitivity CALL-R-2', () => {
  it('lowercases [!Note], [!note], [!NOTE] alike', () => {
    expect(detect('> [!Note]')?.type).toBe('note');
    expect(detect('> [!note]')?.type).toBe('note');
    expect(detect('> [!NOTE]')?.type).toBe('note');
  });
});

describe('detect_callout — unknown type CALL-R-2 CALL-R-7', () => {
  it('returns type=unknown for unrecognized type identifiers', () => {
    const info = detect('> [!HINT]');
    expect(info?.type).toBe('unknown');
    expect(info?.raw_type).toBe('HINT');
  });

  it('synthesizes title with first-letter capitalized for unknown types', () => {
    const info = detect('> [!HINT]')!;
    expect(synthesize_title(info)).toBe('Hint');
    expect(synthesize_title(detect('> [!info]')!)).toBe('Info');
    expect(synthesize_title(detect('> [!Foo]')!)).toBe('Foo');
  });
});

describe('detect_callout — bare callout CALL-R-4', () => {
  it('returns info with title=null for `> [!NOTE]` standalone', () => {
    const info = detect('> [!NOTE]');
    expect(info).not.toBeNull();
    expect(info?.title).toBeNull();
  });
});

describe('detect_callout — whitespace variants CALL-E-4', () => {
  it('handles `>  [!NOTE]` (two spaces after >)', () => {
    expect(detect('>  [!NOTE]')?.type).toBe('note');
  });

  it('handles `>[!NOTE]` (no space after >)', () => {
    expect(detect('>[!NOTE]')?.type).toBe('note');
  });

  it('treats trailing-only whitespace as no title', () => {
    const info = detect('> [!NOTE]   ');
    expect(info?.title).toBeNull();
  });
});

describe('detect_callout — custom titles CALL-R-4', () => {
  it('captures custom title text after the marker', () => {
    const info = detect('> [!NOTE] My custom title\n> body');
    expect(info?.title).toBe('My custom title');
  });
});

describe('detect_callout — fold markers CALL-R-8', () => {
  it('captures `-` collapsed marker', () => {
    const info = detect('> [!NOTE]-\n> body');
    expect(info?.fold).toBe('-');
  });

  it('captures `+` expanded marker', () => {
    const info = detect('> [!NOTE]+ With title\n> body');
    expect(info?.fold).toBe('+');
    expect(info?.title).toBe('With title');
  });
});

describe('detect_callout — non-first-line markers CALL-R-1', () => {
  it('returns null when [!NOTE] is on a non-first line', () => {
    const info = detect('> body\n> [!NOTE]\n> more');
    expect(info).toBeNull();
  });
});

describe('detect_callout — pipe metadata (Q7 deferred) CALL-E-5', () => {
  it('returns null when type contains a pipe — falls to plain blockquote', () => {
    const info = detect('> [!NOTE|meta]');
    expect(info).toBeNull();
  });
});

describe('detect_callout — non-callout blockquote CALL-E-1 CALL-E-2', () => {
  it('returns null for plain blockquote', () => {
    expect(detect('> just a quote')).toBeNull();
  });

  it('returns null for blockquote with non-callout bracketed content', () => {
    expect(detect('> [foo] bar')).toBeNull();
  });
});

describe('detect_callout — nested callout outer line CALL-E-3', () => {
  it('strips multiple `>` from `> > [!NOTE]`', () => {
    const info = detect('> > [!NOTE]\n> > body');
    expect(info?.type).toBe('note');
  });
});

describe('detect_callout — byte offsets CALL-R-9', () => {
  it('reports marker_from/marker_to over the [!TYPE]<fold> <title> span', () => {
    const doc = '> [!NOTE] Hello\n> body';
    const info = detect(doc)!;
    expect(doc.slice(info.marker_from, info.marker_to)).toBe('[!NOTE] Hello');
  });
});
