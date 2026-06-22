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

  it('returns an empty block for unknown or missing values', () => {
    expect(theme_css_for('solarized')).toBe('');
    expect(theme_css_for(undefined)).toBe('');
    expect(theme_css_for(null)).toBe('');
    expect(theme_css_for(42)).toBe('');
    expect(theme_css_for('')).toBe('');
  });
});

describe.each([
  ['GITHUB_LIGHT_CSS', GITHUB_LIGHT_CSS],
  ['GITHUB_DARK_CSS', GITHUB_DARK_CSS],
  ['CLAUDIFY_CSS', CLAUDIFY_CSS],
])('%s integrity THEME-D-6', (_name, css) => {
  it('is a string, not a backtick-broken comparison expression', () => {
    expect(typeof css).toBe('string');
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

describe('theme palette divergence', () => {
  it('light and dark assign different editor surfaces', () => {
    expect(GITHUB_LIGHT_CSS).toContain('--plainmark-editor-background: #ffffff');
    expect(GITHUB_DARK_CSS).toContain('--plainmark-editor-background: #0d1117');
    expect(GITHUB_LIGHT_CSS).toContain('--plainmark-editor-foreground: #1f2328');
    expect(GITHUB_DARK_CSS).toContain('--plainmark-editor-foreground: #f0f6fc');
  });
});

describe('claudify palette', () => {
  it('paints the warm cream page with slate ink', () => {
    expect(CLAUDIFY_CSS).toContain('--plainmark-editor-background: #f0eee6');
    expect(CLAUDIFY_CSS).toContain('--plainmark-editor-foreground: #141413');
  });

  it('drives interactive surfaces with the terracotta accent', () => {
    expect(CLAUDIFY_CSS).toContain('--plainmark-link-color: #b5420c');
    expect(CLAUDIFY_CSS).toContain('--plainmark-cursor-color: #cc785c');
    expect(CLAUDIFY_CSS).toContain('--plainmark-footnote-marker-color: #b5420c');
  });

  it('sets a serif heading stack over a system sans body', () => {
    expect(CLAUDIFY_CSS).toMatch(/--plainmark-heading-font-family:[^;]*serif;/);
    expect(CLAUDIFY_CSS).toContain('--plainmark-font-text: system-ui');
  });
});
