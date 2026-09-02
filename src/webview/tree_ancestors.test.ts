import { markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { ancestor, count_ancestors, enclosing } from './tree_ancestors.js';

function node_at(doc: string, pos: number) {
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: [GFM] })] });
  return syntaxTree(state).resolveInner(pos, 1);
}

describe('tree_ancestors', () => {
  it('enclosing includes the node itself; ancestor starts at the parent', () => {
    const list_item = node_at('- a', 0).parent!;
    expect(list_item.name).toBe('ListItem');
    expect(enclosing(list_item, 'ListItem')).toBe(list_item);
    expect(ancestor(list_item, 'ListItem')).toBeNull();
    expect(ancestor(list_item, 'BulletList')?.name).toBe('BulletList');
    expect(enclosing(null, 'ListItem')).toBeNull();
  });

  it('count_ancestors counts nesting and stops at the named container', () => {
    // `x` is in a paragraph inside a quote inside two list levels.
    const doc = '- a\n  - > x';
    const x = node_at(doc, doc.length - 1);
    expect(count_ancestors(x, 'ListItem')).toBe(2);
    expect(count_ancestors(x, 'ListItem', 'Blockquote')).toBe(0);
    expect(count_ancestors(x, 'Blockquote')).toBe(1);
  });
});
