import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { normalize_list_indent_spec } from './normalize_list_indent.js';

function normalize(doc: string): string | null {
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: [GFM] })] });
  const spec = normalize_list_indent_spec(state);
  if (!spec) return null;
  return state.update(spec).state.doc.toString();
}

describe('LIST-I-15 normalize_list_indent_spec', () => {
  it('dedents 1–3-space top-level bullet items to column 0', () => {
    expect(normalize('  - a\n  - b\n')).toBe('- a\n- b\n');
    expect(normalize(' - a\n')).toBe('- a\n');
    expect(normalize('   - a\n')).toBe('- a\n');
  });

  it('dedents ordered and task items', () => {
    expect(normalize('  1. a\n  2. b\n')).toBe('1. a\n2. b\n');
    expect(normalize('  1) a\n')).toBe('1) a\n');
    expect(normalize('  - [ ] a\n  - [x] b\n')).toBe('- [ ] a\n- [x] b\n');
  });

  it('shifts the whole item span so internal structure is preserved', () => {
    expect(normalize('  - a\n    cont\n    - child\n')).toBe('- a\n  cont\n  - child\n');
    expect(normalize('  - a\n\n        code\n')).toBe('- a\n\n      code\n');
  });

  it('keeps a preceding paragraph out of the shift', () => {
    expect(normalize('intro:\n  - a\n  - b\n')).toBe('intro:\n- a\n- b\n');
  });

  it('leaves a lazy continuation line with less indent than the marker as is', () => {
    expect(normalize('  - a\nlazy\n')).toBe('- a\nlazy\n');
  });

  it('normalizes mixed-indent siblings of one list', () => {
    expect(normalize('  - a\n- b\n')).toBe('- a\n- b\n');
  });

  it('returns null when nothing qualifies', () => {
    expect(normalize('- a\n- b\n')).toBeNull();
    expect(normalize('para\n\n    - four spaces is a code block\n')).toBeNull();
    expect(normalize('>  - a\n')).toBeNull();
    expect(normalize('- a\n  - nested\n')).toBeNull();
    expect(normalize('plain text\n')).toBeNull();
  });

  it('skips an item with a tab in any leading run of its span', () => {
    expect(normalize('  - a\n\tcont\n')).toBeNull();
  });

  it('is idempotent', () => {
    const once = normalize('  - a\n    - b\n');
    expect(once).toBe('- a\n  - b\n');
    expect(normalize(once as string)).toBeNull();
  });
});
