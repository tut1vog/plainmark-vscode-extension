import { describe, expect, it } from 'vitest';
import {
  lookup_seam_override,
  resolve_prettify_seams,
  SEAM_KINDS,
} from './prettify_seams_config.js';

describe('PARA-I-8 resolve_prettify_seams', () => {
  it('resolves an empty or absent setting to no overrides', () => {
    expect(resolve_prettify_seams(undefined)).toEqual({ resolved: [], warnings: [] });
    expect(resolve_prettify_seams({})).toEqual({ resolved: [], warnings: [] });
  });

  it('accepts every kind on both sides plus the wildcard', () => {
    for (const kind of SEAM_KINDS) {
      const { resolved, warnings } = resolve_prettify_seams({ [`${kind}>${kind}`]: 1 });
      expect(warnings).toEqual([]);
      expect(resolved).toEqual([{ above: kind, below: kind, blanks: 1 }]);
    }
    expect(resolve_prettify_seams({ '*>*': 0 }).resolved).toEqual([
      { above: '*', below: '*', blanks: 0 },
    ]);
  });

  it('tolerates whitespace around the separator', () => {
    expect(resolve_prettify_seams({ ' table > paragraph ': 0 }).resolved).toEqual([
      { above: 'table', below: 'paragraph', blanks: 0 },
    ]);
  });

  it('rejects a non-object setting', () => {
    expect(resolve_prettify_seams(['table>paragraph']).resolved).toEqual([]);
    expect(resolve_prettify_seams('table>paragraph').warnings).toHaveLength(1);
  });

  it('warns and drops malformed keys', () => {
    const { resolved, warnings } = resolve_prettify_seams({
      'table': 0,
      'a>b>c': 0,
      'widget>paragraph': 0,
      'table>widget': 0,
    });
    expect(resolved).toEqual([]);
    expect(warnings).toHaveLength(4);
    expect(warnings[2]).toContain('unknown block kind "widget"');
  });

  it('warns and drops out-of-range or non-integer values', () => {
    const { resolved, warnings } = resolve_prettify_seams({
      'table>paragraph': -1,
      'list>paragraph': 4,
      'quote>paragraph': 1.5,
      'math>paragraph': '1',
    });
    expect(resolved).toEqual([]);
    expect(warnings).toHaveLength(4);
  });

  it('keeps the first of two keys that canonicalize alike', () => {
    const { resolved, warnings } = resolve_prettify_seams({
      'table>paragraph': 0,
      ' table>paragraph ': 1,
    });
    expect(resolved).toEqual([{ above: 'table', below: 'paragraph', blanks: 0 }]);
    expect(warnings).toHaveLength(1);
  });
});

describe('PARA-I-8 lookup_seam_override', () => {
  const { resolved } = resolve_prettify_seams({
    '*>*': 3,
    'table>*': 2,
    '*>heading': 1,
    'table>heading': 0,
  });

  it('prefers the most specific match', () => {
    expect(lookup_seam_override(resolved, 'table', 'heading')).toBe(0);
    expect(lookup_seam_override(resolved, 'list', 'heading')).toBe(1);
    expect(lookup_seam_override(resolved, 'table', 'list')).toBe(2);
    expect(lookup_seam_override(resolved, 'list', 'list')).toBe(3);
  });

  it('breaks a wildcard tie toward the block below', () => {
    const { resolved: tie } = resolve_prettify_seams({ 'heading>*': 1, '*>heading': 0 });
    expect(lookup_seam_override(tie, 'heading', 'heading')).toBe(0);
  });

  it('returns null when nothing matches', () => {
    expect(lookup_seam_override([], 'table', 'heading')).toBeNull();
    const { resolved: only } = resolve_prettify_seams({ 'table>heading': 0 });
    expect(lookup_seam_override(only, 'list', 'heading')).toBeNull();
  });
});
