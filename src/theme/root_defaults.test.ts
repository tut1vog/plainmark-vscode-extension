import { describe, expect, it } from 'vitest';
import { ROOT_DEFAULTS_CSS } from './root_defaults.js';

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

describe('ROOT_DEFAULTS_CSS integrity THEME-D-1 THEME-D-6', () => {
  it('is a string, not a backtick-broken comparison expression', () => {
    // A backtick inside the template literal splits it into `a` > `b`, which
    // compiles fine (string comparison) and injects "<style>true</style>".
    expect(typeof ROOT_DEFAULTS_CSS).toBe('string');
  });

  it('contains no backtick characters', () => {
    expect(ROOT_DEFAULTS_CSS).not.toContain('`');
  });

  it('declares a single :root block plus the body.vscode-dark override', () => {
    expect(ROOT_DEFAULTS_CSS.match(/:root\s*\{/g)).toHaveLength(1);
    expect(ROOT_DEFAULTS_CSS.match(/body\.vscode-dark\s*\{/g)).toHaveLength(1);
  });

  it('has balanced braces, parens, and CSS comments', () => {
    const count = (re: RegExp) => (ROOT_DEFAULTS_CSS.match(re) ?? []).length;
    expect(count(/\{/g)).toBe(count(/\}/g));
    expect(count(/\(/g)).toBe(count(/\)/g));
    expect(count(/\/\*/g)).toBe(count(/\*\//g));
  });

  it('declares the full --plainmark-syntax-* token palette in both light and dark', () => {
    for (const token of SYNTAX_TOKENS) {
      const declarations = ROOT_DEFAULTS_CSS.match(
        new RegExp(`--plainmark-syntax-${token}-color\\s*:`, 'g'),
      );
      // one in :root (light), one in body.vscode-dark
      expect(declarations, `--plainmark-syntax-${token}-color`).toHaveLength(2);
    }
  });

  it('declares and consumes the editor-background/foreground root aliases THEME-V-2', () => {
    expect(ROOT_DEFAULTS_CSS).toContain(
      '--plainmark-editor-background: var(--vscode-editor-background)',
    );
    expect(ROOT_DEFAULTS_CSS).toContain(
      '--plainmark-editor-foreground: var(--vscode-editor-foreground)',
    );
    expect(ROOT_DEFAULTS_CSS).toMatch(
      /body\s*\{[^}]*background-color: var\(--plainmark-editor-background/,
    );
    expect(ROOT_DEFAULTS_CSS).toMatch(/body\s*\{[^}]*color: var\(--plainmark-editor-foreground/);
  });

  it('chains every cluster consumer through the cross-cutting primitives THEME-V-10', () => {
    expect(ROOT_DEFAULTS_CSS).toContain(
      '--plainmark-muted-color: var(--vscode-descriptionForeground, currentColor)',
    );
    expect(ROOT_DEFAULTS_CSS).toContain(
      '--plainmark-popover-background: var(--vscode-editorHoverWidget-background',
    );
    expect(ROOT_DEFAULTS_CSS).toContain(
      '--plainmark-popover-border-color: var(--vscode-editorHoverWidget-border',
    );
    const muted_consumers = [
      'link-marker-color',
      'list-marker-color',
      'task-checked-color',
      'callout-unknown-color',
      'footnote-definition-color',
      'fenced-code-language-label-color',
    ];
    for (const name of muted_consumers) {
      expect(
        ROOT_DEFAULTS_CSS,
        `--plainmark-${name} chains through --plainmark-muted-color`,
      ).toMatch(new RegExp(`--plainmark-${name}: var\\(--plainmark-muted-color`));
    }
    for (const name of [
      'footnote-popover-background',
      'mermaid-preview-background',
      'autocomplete-background',
    ]) {
      expect(ROOT_DEFAULTS_CSS, `--plainmark-${name}`).toMatch(
        new RegExp(`--plainmark-${name}: var\\(--plainmark-popover-background`),
      );
    }
    for (const name of [
      'footnote-popover-border',
      'mermaid-preview-border',
      'autocomplete-border-color',
    ]) {
      expect(ROOT_DEFAULTS_CSS, `--plainmark-${name}`).toMatch(
        new RegExp(`--plainmark-${name}: var\\(--plainmark-popover-border-color`),
      );
    }
  });
});
