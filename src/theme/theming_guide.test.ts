import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROOT_DEFAULTS_CSS } from './root_defaults';

const read_doc = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../docs/${rel}`, import.meta.url)), 'utf8');

const guide = read_doc('theming-guide.md');
const starter = read_doc('examples/starter-theme.css');

// declarations only: `--plainmark-x:` — a `var(--plainmark-x, …)` consumption is
// followed by `,` or `)`, never `:`, so the lookahead excludes it
const declared = new Set(ROOT_DEFAULTS_CSS.match(/--plainmark-[a-z0-9-]+(?=\s*:)/g));

const guide_documented = new Set(
  [...guide.matchAll(/^\| `(--plainmark-[a-z0-9-]+)`/gm)].map((m) => m[1]),
);

describe('theming-guide.md drift guard', () => {
  it('documents every token declared in ROOT_DEFAULTS_CSS', () => {
    const missing = [...declared].filter((t) => !guide_documented.has(t));
    expect(missing, 'declared in ROOT_DEFAULTS_CSS but absent from the guide tables').toEqual([]);
  });

  it('documents only tokens that actually exist', () => {
    const stale = [...guide_documented].filter((t) => !declared.has(t));
    expect(stale, 'guide table rows with no matching ROOT_DEFAULTS_CSS declaration').toEqual([]);
  });

  it('starter-theme.css references only declared tokens', () => {
    const referenced = new Set(starter.match(/--plainmark-[a-z0-9-]+/g));
    const dead = [...referenced].filter((t) => !declared.has(t));
    expect(dead, 'starter theme would set variables nothing consumes').toEqual([]);
  });
});
