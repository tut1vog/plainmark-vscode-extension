import { describe, expect, it } from 'vitest';
import { walk_back_through_runs } from './hidden_marker_runs.js';

describe('SHELL-X-10: walk_back_through_runs', () => {
  it('returns pos unchanged when no run touches it', () => {
    expect(walk_back_through_runs([], 10)).toBe(10);
    expect(walk_back_through_runs([{ from: 1, to: 3 }], 10)).toBe(10);
  });

  it('walks to the start of a run ending at pos', () => {
    expect(walk_back_through_runs([{ from: 46, to: 111 }], 111)).toBe(46);
  });

  it('walks from inside a run to its start', () => {
    expect(walk_back_through_runs([{ from: 46, to: 111 }], 70)).toBe(46);
  });

  it('chains through adjacent runs regardless of input order', () => {
    const runs = [
      { from: 2, to: 4 },
      { from: 8, to: 12 },
      { from: 4, to: 8 },
    ];
    expect(walk_back_through_runs(runs, 12)).toBe(2);
  });

  it('stops at a gap between runs', () => {
    const runs = [
      { from: 2, to: 4 },
      { from: 6, to: 12 },
    ];
    expect(walk_back_through_runs(runs, 12)).toBe(6);
  });

  it('ignores runs entirely at or after pos', () => {
    expect(walk_back_through_runs([{ from: 12, to: 14 }], 12)).toBe(12);
  });

  it('handles overlapping runs', () => {
    const runs = [
      { from: 5, to: 12 },
      { from: 3, to: 8 },
    ];
    expect(walk_back_through_runs(runs, 12)).toBe(3);
  });
});
