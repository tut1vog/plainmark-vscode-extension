import { languages } from '@codemirror/language-data';
import { describe, expect, it } from 'vitest';
import { match_code_language } from './language_aliases.js';

function match(tag: string): string | undefined {
  return match_code_language(tag)?.name;
}

describe('language alias registry CBLK-R-16', () => {
  // Every aliased fence tag resolves to its base registry language. A failure
  // here also catches base-name drift after a @codemirror/language-data
  // upgrade (a missing base silently drops its wrapper).
  const alias_cases: ReadonlyArray<readonly [string, string]> = [
    ['assembly', 'Gas'],
    ['asm', 'Gas'],
    ['nasm', 'Gas'],
    ['x86asm', 'Gas'],
    ['wasm', 'WebAssembly'],
    ['wast', 'WebAssembly'],
    ['postgres', 'PostgreSQL'],
    ['pgsql', 'PostgreSQL'],
    ['mssql', 'MS SQL'],
    ['tsql', 'MS SQL'],
    ['vbnet', 'VB.NET'],
    ['vb', 'VB.NET'],
    ['delphi', 'Pascal'],
    ['objectpascal', 'Pascal'],
    ['docker', 'Dockerfile'],
    ['golang', 'Go'],
    ['matlab', 'Octave'],
    ['md', 'Markdown'],
    ['py', 'Python'],
    ['rs', 'Rust'],
    ['hs', 'Haskell'],
    ['kt', 'Kotlin'],
    ['jl', 'Julia'],
    ['pl', 'Perl'],
    ['erl', 'Erlang'],
    ['clj', 'Clojure'],
    ['cljs', 'ClojureScript'],
    ['fs', 'F#'],
    ['ps', 'PowerShell'],
    ['ps1', 'PowerShell'],
    ['pwsh', 'PowerShell'],
    ['objectivec', 'Objective-C'],
    ['wolfram', 'Mathematica'],
    ['wl', 'Mathematica'],
    ['mma', 'Mathematica'],
    ['proto', 'ProtoBuf'],
    ['patch', 'diff'],
    ['gradle', 'Groovy'],
    ['svg', 'XML'],
    ['plist', 'XML'],
    ['jsonc', 'JSON'],
    ['console', 'Shell'],
    ['shell-session', 'Shell'],
  ];

  it.each(alias_cases)('resolves ```%s → %s', (tag, name) => {
    expect(match(tag)).toBe(name);
  });

  it('is case-insensitive like every other fence tag', () => {
    expect(match('ASM')).toBe('Gas');
    expect(match('Matlab')).toBe('Octave');
  });

  it('does not shadow existing registry tags', () => {
    expect(match('gas')).toBe('Gas');
    expect(match('js')).toBe('JavaScript');
    expect(match('python')).toBe('Python');
    expect(match('cpp')).toBe('C++');
    expect(match('webassembly')).toBe('WebAssembly');
  });

  it('preserves the stock registry fuzzy pass for non-aliased tags', () => {
    // Fuzzy resolution the base registry provides on its own; the alias layer
    // itself is exact-match only and must not disturb it.
    expect(match('elisp')).toBe('Common Lisp');
  });

  it('an aliased tag loads the SAME LanguageSupport as its canonical tag', async () => {
    const wrapper = match_code_language('asm');
    const base = languages.find((l) => l.name === 'Gas');
    expect(wrapper).not.toBeNull();
    expect(base).toBeDefined();
    const [wrapper_support, base_support] = await Promise.all([
      wrapper!.load(),
      base!.load(),
    ]);
    expect(wrapper_support).toBe(base_support);
  });

  it('deliberately excluded tags stay unresolved', () => {
    // `ml` — ambiguous OCaml vs SML (hljs-documented). `armasm`/`mips`/
    // `riscv` — different instruction sets; the alias layer is exact-match
    // only precisely so the `asm` alias cannot fuzzy-capture them. `racket` —
    // unsourced cross-language mapping, deferred.
    for (const tag of ['ml', 'armasm', 'mips', 'riscv', 'racket']) {
      expect(match(tag), tag).toBeUndefined();
    }
  });

  it('grammar-less languages still fall through to un-tokenized monospace (CBLK-E-5)', () => {
    for (const tag of ['elixir', 'graphql', 'terraform', 'zig', 'makefile', 'bat']) {
      expect(match(tag), tag).toBeUndefined();
    }
  });
});
