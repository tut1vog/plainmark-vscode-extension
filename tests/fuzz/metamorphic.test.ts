// Metamorphic parser properties over the CommonMark + GFM spec corpus
// (T28.4). Each property is a transformation that should leave the
// node-type structure of the parse tree unchanged. None of these
// properties are exhaustively asserted by the CommonMark or cmark-gfm
// test harnesses themselves; they are explicit-in-spec guarantees that
// fall out for free when lezer-markdown is correct.
//
// Properties tested:
//   - CRLF ↔ LF identity (CommonMark §2.1: \n / \r / \r\n are all line
//     endings)
//   - Trailing whitespace at end-of-document (0–3 trailing spaces after
//     the final newline must not change the parse)
//   - Blank-line idempotence at end-of-document (an additional trailing
//     blank line must not change the block structure)
//
// Per-property allowlist: a small set of corpus entries already contain
// the metamorphism in question or otherwise interact with it in a way
// the spec does not protect against; these are skipped with a comment
// linking back to the offending construct. The allowlist stays small —
// growing it should prompt a closer look at whether lezer-markdown is
// honouring the property.

import { describe, expect, it } from 'vitest';
import type { Tree } from '@lezer/common';
import { native_to_lf } from '../../src/sync/translate.js';
import { load_commonmark, load_gfm_extensions, type SpecEntry } from './load-corpora.js';
import { gfm_parser } from './parsers.js';
import { structurally_equal } from './structural-equal.js';

const commonmark = load_commonmark();
const gfm_extensions = load_gfm_extensions();
const all = [...commonmark, ...gfm_extensions];

function describe_entry(e: SpecEntry): string {
  return `${e.source}#${e.example} (${e.section})`;
}

function parse(src: string): Tree {
  return gfm_parser.parse(src);
}

// Known upstream divergences — entries where lezer-markdown's parse is
// structurally different across the metamorphism but the difference is
// rooted in CommonMark itself (e.g. backslash-CRLF hard breaks, unclosed
// fenced code at EOF absorbing trailing bytes, setext-vs-ATX disambiguation
// across line endings). The allowlist is loaded from
// `fixtures/metamorphic-known-divergences.json` so the test fails when a
// new divergence appears (regression) or when a previously-listed entry no
// longer diverges (cleanup signal). Initial census: T28.4 first run,
// 2026-05-28.
import known_divergences from './fixtures/metamorphic-known-divergences.json';

type DivergenceKey = `${string}#${number}`;
type DivergenceMap = Record<string, DivergenceKey[]>;

function key(entry: SpecEntry): DivergenceKey {
  return `${entry.source}#${entry.example}`;
}

function check_property(
  property: string,
  entries: SpecEntry[],
  transform: (src: string) => string,
): void {
  const expected = new Set((known_divergences as DivergenceMap)[property] ?? []);
  const observed_failures: DivergenceKey[] = [];
  for (const entry of entries) {
    const original_tree = parse(entry.markdown);
    const transformed_tree = parse(transform(entry.markdown));
    const result = structurally_equal(original_tree, transformed_tree);
    if (!result.ok) observed_failures.push(key(entry));
  }
  const observed = new Set(observed_failures);
  const new_regressions = observed_failures.filter((k) => !expected.has(k));
  const stale_allowlist = [...expected].filter((k) => !observed.has(k));
  if (new_regressions.length > 0) {
    throw new Error(
      `${property}: ${new_regressions.length} new regression(s) — ` +
        `add to fixtures/metamorphic-known-divergences.json if confirmed upstream:\n  ` +
        new_regressions.slice(0, 20).join('\n  '),
    );
  }
  if (stale_allowlist.length > 0) {
    throw new Error(
      `${property}: ${stale_allowlist.length} allowlisted entry now passes — ` +
        `remove from fixtures/metamorphic-known-divergences.json:\n  ` +
        stale_allowlist.slice(0, 20).join('\n  '),
    );
  }
}

describe('metamorphic: CRLF ↔ LF identity', () => {
  it('replacing every LF with CRLF preserves the parse tree', () => {
    check_property('crlf', all, (src) => src.replace(/\n/g, '\r\n'));
  });
});

// FIX-5 (review 2026-06-10): lone `\r` is normalized at the host boundary
// (`native_to_lf`), so the webview parser never sees a CR variant — the
// invariant to fuzz is the boundary function itself: any EOL flavor of a
// corpus entry must normalize to the exact LF original. String identity over
// the full corpus, no parse needed.
describe('metamorphic: host-boundary EOL normalization (translate.ts)', () => {
  it('lone-CR (classic-Mac) variants normalize to the LF original', () => {
    for (const entry of all) {
      expect(native_to_lf(entry.markdown.replace(/\n/g, '\r'))).toBe(entry.markdown);
    }
  });

  it('CRLF variants normalize to the LF original', () => {
    for (const entry of all) {
      expect(native_to_lf(entry.markdown.replace(/\n/g, '\r\n'))).toBe(entry.markdown);
    }
  });

  it('mixed CRLF / lone-CR / LF variants normalize to the LF original', () => {
    // Cycle order keeps a lone `\r` from landing directly before a `\n` on
    // adjacent line breaks — that byte sequence IS a single `\r\n` break to
    // any LF normalizer (CM6's DefaultSplit included), not two.
    for (const entry of all) {
      let i = 0;
      const eols = ['\r\n', '\n', '\r'];
      const mixed = entry.markdown.replace(/\n/g, () => eols[i++ % 3]);
      expect(native_to_lf(mixed)).toBe(entry.markdown);
    }
  });
});

describe('metamorphic: trailing whitespace insensitivity', () => {
  for (const spaces of [1, 2, 3]) {
    it(`appending ${spaces} trailing space${spaces > 1 ? 's' : ''} preserves the parse tree`, () => {
      const pad = ' '.repeat(spaces);
      check_property(`trailing-${spaces}sp`, all, (src) => src + pad);
    });
  }
});

describe('metamorphic: trailing blank-line idempotence', () => {
  it('appending one extra trailing newline preserves the parse tree', () => {
    check_property('trailing-blank', all, (src) => (src.endsWith('\n') ? src + '\n' : src + '\n\n'));
  });
});

describe('metamorphic: smoke', () => {
  it('corpora loaded', () => {
    expect(commonmark.length).toBeGreaterThan(600);
    expect(gfm_extensions.length).toBeGreaterThan(20);
  });
});
