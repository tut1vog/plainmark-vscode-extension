import { describe, expect, it } from 'vitest';
import { CLAUDIFY_CSS } from './claudify.js';
import { GITHUB_DARK_CSS } from './github_dark.js';
import { GITHUB_LIGHT_CSS } from './github_light.js';
import { normalize_theme_id, theme_css_for } from './themes.js';

const SYNTAX_TOKENS = [
  'keyword',
  'comment',
  'string',
  'number',
  'function',
  'variable',
  'type',
  'property',
  'tag',
  'meta',
  'punctuation',
  'invalid',
] as const;

describe('normalize_theme_id', () => {
  it('passes through the fixed-palette theme ids', () => {
    expect(normalize_theme_id('github-light')).toBe('github-light');
    expect(normalize_theme_id('github-dark')).toBe('github-dark');
    expect(normalize_theme_id('claudify')).toBe('claudify');
  });

  it('normalizes unknown or missing values to default', () => {
    expect(normalize_theme_id('default')).toBe('default');
    expect(normalize_theme_id('solarized')).toBe('default');
    expect(normalize_theme_id(undefined)).toBe('default');
    expect(normalize_theme_id(42)).toBe('default');
  });
});

describe('theme_css_for', () => {
  it('maps each fixed theme id to its CSS block', () => {
    expect(theme_css_for('github-light')).toBe(GITHUB_LIGHT_CSS);
    expect(theme_css_for('github-dark')).toBe(GITHUB_DARK_CSS);
    expect(theme_css_for('claudify')).toBe(CLAUDIFY_CSS);
  });

  it('returns an empty block for the adaptive default', () => {
    expect(theme_css_for('default')).toBe('');
  });

  it('returns an empty block for an unknown value once normalized', () => {
    expect(theme_css_for(normalize_theme_id('solarized'))).toBe('');
  });
});

describe.each([
  ['GITHUB_LIGHT_CSS', GITHUB_LIGHT_CSS],
  ['GITHUB_DARK_CSS', GITHUB_DARK_CSS],
  ['CLAUDIFY_CSS', CLAUDIFY_CSS],
])('%s integrity THEME-D-6', (_name, css) => {
  it('is a non-empty CSS block exposing the --plainmark- variable surface', () => {
    // A backtick-broken template literal collapses to a boolean comparison
    // (THEME-D-6): it would have no length and carry none of the theme's
    // promised --plainmark-* variables. A real fixed-palette block has both.
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('--plainmark-');
  });

  it('contains no backtick characters', () => {
    expect(css).not.toContain('`');
  });

  it('has balanced braces, parens, and CSS comments', () => {
    const count = (re: RegExp) => (css.match(re) ?? []).length;
    expect(count(/\{/g)).toBe(count(/\}/g));
    expect(count(/\(/g)).toBe(count(/\)/g));
    expect(count(/\/\*/g)).toBe(count(/\*\//g));
  });

  it('contains no --vscode-* chains — fixed appearance, decision 1', () => {
    expect(css).not.toContain('--vscode-');
  });

  it('declares every syntax token in :root and repeats it at body.vscode-* specificity', () => {
    for (const token of SYNTAX_TOKENS) {
      const declarations = css.match(
        new RegExp(`--plainmark-syntax-${token}-color\\s*:`, 'g'),
      );
      expect(declarations, `--plainmark-syntax-${token}-color`).toHaveLength(2);
    }
    // The repeat block must include body.vscode-dark to out-cascade root_defaults' dark overrides.
    expect(css).toMatch(/body\.vscode-dark/);
  });

  it('declares the font stacks — decision 3', () => {
    expect(css).toContain('--plainmark-font-text:');
    expect(css).toContain('--plainmark-font-code:');
  });
});

function token(css: string, name: string): string {
  const m = new RegExp(`--plainmark-${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`--plainmark-${name} not declared`);
  return m[1].trim();
}

// Relative luminance (WCAG) of a #rrggbb value — the light/dark relationship
// is the contract, not any particular hex.
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb color: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function families(stack: string): string[] {
  return stack.split(',').map((f) => f.trim());
}

describe('theme palette divergence', () => {
  it('light paints dark ink on a light page and dark inverts both', () => {
    const light_bg = token(GITHUB_LIGHT_CSS, 'editor-background');
    const light_fg = token(GITHUB_LIGHT_CSS, 'editor-foreground');
    const dark_bg = token(GITHUB_DARK_CSS, 'editor-background');
    const dark_fg = token(GITHUB_DARK_CSS, 'editor-foreground');
    expect(luminance(light_bg)).toBeGreaterThan(luminance(light_fg));
    expect(luminance(dark_bg)).toBeLessThan(luminance(dark_fg));
    expect(light_bg).not.toBe(dark_bg);
    expect(light_fg).not.toBe(dark_fg);
  });

  it('keeps readable contrast between page and ink in every fixed palette', () => {
    for (const css of [GITHUB_LIGHT_CSS, GITHUB_DARK_CSS, CLAUDIFY_CSS]) {
      const [a, b] = [token(css, 'editor-background'), token(css, 'editor-foreground')].map(
        luminance,
      );
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('claudify palette', () => {
  it('paints dark ink on a light page', () => {
    expect(luminance(token(CLAUDIFY_CSS, 'editor-background'))).toBeGreaterThan(
      luminance(token(CLAUDIFY_CSS, 'editor-foreground')),
    );
  });

  it('drives links and footnote markers from one accent, distinct from the ink', () => {
    const link = token(CLAUDIFY_CSS, 'link-color');
    expect(token(CLAUDIFY_CSS, 'footnote-marker-color')).toBe(link);
    expect(link).not.toBe(token(CLAUDIFY_CSS, 'editor-foreground'));
    expect(luminance(token(CLAUDIFY_CSS, 'link-color-hover'))).toBeLessThan(luminance(link));
  });

  it('sets a serif heading stack over a sans-serif body stack', () => {
    const heading = families(token(CLAUDIFY_CSS, 'heading-font-family'));
    const body = families(token(CLAUDIFY_CSS, 'font-text'));
    expect(heading).toContain('serif');
    expect(heading).not.toContain('sans-serif');
    expect(body).toContain('sans-serif');
    expect(body).not.toContain('serif');
  });
});
