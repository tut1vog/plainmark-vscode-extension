import { describe, expect, it } from 'vitest';
import { spacing_extension } from './spacing.js';

describe('spacing_extension THEME-S-4', () => {
  it('exports a non-null Extension value', () => {
    expect(spacing_extension).toBeDefined();
    expect(spacing_extension).not.toBeNull();
  });
});
