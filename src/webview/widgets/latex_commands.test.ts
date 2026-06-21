import { describe, expect, it } from 'vitest';
import { LATEX_COMMANDS } from './latex_commands.js';

describe('MATH-I-12 LATEX_COMMANDS dataset', () => {
  it('transcribes the full bundle-scoped catalog', () => {
    expect(LATEX_COMMANDS).toHaveLength(416);
  });

  it('every label is a non-empty backslash command', () => {
    for (const { label } of LATEX_COMMANDS) {
      expect(label.startsWith('\\')).toBe(true);
      expect(label.length).toBeGreaterThan(1);
    }
  });

  it('labels are unique', () => {
    const labels = LATEX_COMMANDS.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('excludes commands outside the bundle (boldsymbol package)', () => {
    expect(LATEX_COMMANDS.some((c) => c.label === '\\boldsymbol')).toBe(false);
  });

  it('carries the motivating symbol entry with its glyph', () => {
    const eps = LATEX_COMMANDS.find((c) => c.label === '\\varepsilon');
    expect(eps).toEqual({ label: '\\varepsilon', glyph: 'ε' });
  });

  it('argument commands carry a snippet template starting at the label', () => {
    const frac = LATEX_COMMANDS.find((c) => c.label === '\\frac');
    expect(frac?.template).toBe('\\frac{${}}{${}}${}');
  });

  it('every template starts with its label and ends with a terminal tab-stop', () => {
    for (const { label, template } of LATEX_COMMANDS) {
      if (template === undefined) continue;
      expect(template.startsWith(label)).toBe(true);
      expect(template.endsWith('${}')).toBe(true);
      // at least one argument field plus the terminal stop
      expect(template.match(/\$\{\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('every glyph is a non-empty string', () => {
    for (const { glyph } of LATEX_COMMANDS) {
      if (glyph === undefined) continue;
      expect(glyph.length).toBeGreaterThan(0);
    }
  });
});
