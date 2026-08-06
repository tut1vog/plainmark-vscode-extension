// Malformed-input fuzz. Over the curated adversarial corpus plus seeded
// mutants of well-formed generator output:
//   1. Plainmark's full parser (GFM + math + footnote + frontmatter +
//      quote-exit) never throws, and its tree spans the whole input.
//   2. Incremental reparse after a one-char append is structurally identical
//      to a fresh full parse — the same differential as spec-corpus.test.ts,
//      pointed at malformed input.
//   3. INV-SP-4: the sync loop's open→ready handshake emits no edits and
//      posts the malformed text byte-identically.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { TreeFragment } from '@lezer/common';
import { parser as base_parser } from '@lezer/markdown';
import { markdown_grammar_extensions } from '../../src/webview/grammar/markdown_config.js';
import { create_sync_loop } from '../../src/sync/loop.js';
import { compareTree } from './compare-tree.js';
import { gen_markdown } from './gen-markdown.js';
import { CURATED, mutate_markdown, type MalformedCase } from './gen-malformed.js';
import { mulberry32 } from './rng.js';

const plainmark_parser = base_parser.configure(markdown_grammar_extensions);

const SEED = 0xbadba5e;
const MUTANT_COUNT = 300;

function gen_mutants(): MalformedCase[] {
  const rng = mulberry32(SEED);
  const out: MalformedCase[] = [];
  for (let i = 0; i < MUTANT_COUNT; i++) {
    const doc_seed = ((rng() * 0xffffffff) >>> 0) || 1;
    out.push({
      name: `mutant-${i} (doc_seed=0x${doc_seed.toString(16)})`,
      text: mutate_markdown(rng, gen_markdown({ seed: doc_seed })),
    });
  }
  return out;
}

const mutants = gen_mutants();

function check_parse_invariants({ name, text }: MalformedCase): void {
  let tree;
  try {
    tree = plainmark_parser.parse(text);
  } catch (err) {
    throw new Error(
      `${name}: full parse threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (tree.length !== text.length) {
    throw new Error(`${name}: tree spans ${tree.length} of ${text.length} input chars`);
  }
  const fragments = TreeFragment.applyChanges(TreeFragment.addTree(tree), [
    { fromA: text.length, toA: text.length, fromB: text.length, toB: text.length + 1 },
  ], 2);
  const edited = text + 'x';
  const incremental = plainmark_parser.parse(edited, fragments);
  const full = plainmark_parser.parse(edited);
  try {
    compareTree(incremental, full);
  } catch (err) {
    throw new Error(
      `${name}: incremental ≠ full reparse after append: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

describe('malformed fuzz: full parser never throws, tree spans input, incremental = full', () => {
  it(`curated corpus: ${CURATED.length} cases`, () => {
    for (const entry of CURATED) check_parse_invariants(entry);
  });

  it(`mutated generator output: ${MUTANT_COUNT} docs — seed=0x${SEED.toString(16)}`, () => {
    for (const entry of mutants) check_parse_invariants(entry);
  });
});

describe('INV-SP-4: malformed input: ready handshake emits no edits, syncs bytes verbatim', () => {
  beforeEach(() => {
    const original_log = console.log;
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0] === '[sync]') return;
      original_log.apply(console, args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const { name, text } of CURATED) {
    it(name, async () => {
      const posted: unknown[] = [];
      const applies: unknown[] = [];
      const loop = create_sync_loop(
        {
          uri_string: `untitled:malformed/${name}`,
          get_text: () => text,
          get_version: () => 1,
          get_document_dir_webview_uri: () => null,
        },
        { post_message: (m) => posted.push(m) },
        {
          apply_full_replace: async (uri_string, lf_text) => {
            applies.push({ uri_string, lf_text });
            return true;
          },
        },
      );

      await loop.handle_webview_message({ type: 'ready' });

      expect(applies).toEqual([]);
      expect(posted).toEqual([
        { type: 'sync', text, version: 1, document_dir_webview_uri: null },
      ]);
    });
  }
});
