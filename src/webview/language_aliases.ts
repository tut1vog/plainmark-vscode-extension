import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

// CBLK-R-16 — fence-tag aliases layered over @codemirror/language-data.
//
// A fence's info string matches only a LanguageDescription's name/alias list
// (extensions never participate), so commonly-typed tags like ```asm or
// ```wasm silently miss the registry and render unhighlighted. Each entry
// below maps a base registry language (by exact name) to additional fence
// tags, every one documented by highlight.js SUPPORTED_LANGUAGES.md, GitHub
// Linguist languages.yml, or Typora's supported-language list — or, for
// `cljs`, naming a dedicated grammar the registry already ships. Reference:
// code-fence-language-aliases-2026 (research); ADR-0009 (entry bar, and the
// deliberate exclusions: `ml` ambiguous, `armasm`/`mips`/`riscv` different
// instruction sets, `racket` an unsourced cross-language mapping).
//
// Cross-language approximations follow shipped precedent in those sources:
// asm/nasm/x86asm → Gas highlights Intel-syntax source with an AT&T-syntax
// grammar (Typora ships this identical mapping); tsql/mssql → MS SQL,
// matlab → Octave, gradle → Groovy (DSL only), svg/plist → XML, jsonc → JSON.
const extra_aliases: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['Gas', ['assembly', 'asm', 'nasm', 'x86asm']],
  ['WebAssembly', ['wasm', 'wast']],
  ['PostgreSQL', ['postgres', 'pgsql']],
  ['MS SQL', ['mssql', 'tsql']],
  ['VB.NET', ['vbnet', 'vb']],
  ['Pascal', ['delphi', 'objectpascal']],
  ['Dockerfile', ['docker']],
  ['Go', ['golang']],
  ['Octave', ['matlab']],
  ['Markdown', ['md']],
  ['Python', ['py']],
  ['Rust', ['rs']],
  ['Haskell', ['hs']],
  ['Kotlin', ['kt']],
  ['Julia', ['jl']],
  ['Perl', ['pl']],
  ['Erlang', ['erl']],
  ['Clojure', ['clj']],
  ['ClojureScript', ['cljs']],
  ['F#', ['fs']],
  ['PowerShell', ['ps', 'ps1', 'pwsh']],
  ['Objective-C', ['objectivec']],
  ['Mathematica', ['wolfram', 'wl', 'mma']],
  ['ProtoBuf', ['proto']],
  ['diff', ['patch']],
  ['Groovy', ['gradle']],
  ['XML', ['svg', 'plist']],
  ['JSON', ['jsonc']],
  ['Shell', ['console', 'shell-session']],
];

// Wrapper descriptions delegate load() to the base entry, so an aliased tag
// resolves to the SAME LanguageSupport instance as its canonical tag — no new
// grammar imports, zero bundle delta. A base name missing after a
// language-data upgrade drops its wrapper (the tag degrades to unhighlighted)
// rather than breaking the webview at module load; the unit test catches the
// drift.
const alias_wrappers = extra_aliases.flatMap(([name, alias]) => {
  const base = languages.find((l) => l.name === name);
  return base
    ? [LanguageDescription.of({ name, alias: [...alias], load: () => base.load() })]
    : [];
});

// Passed to markdown({ codeLanguages }) as a FUNCTION, not a merged array: an
// array is always matched with fuzzy=true, whose substring pass would let the
// new `asm` alias capture unrelated tags like ```armasm (a different
// instruction set — see ADR-0009). The alias layer therefore participates in
// EXACT name/alias matching only; the stock registry keeps its unmodified
// behavior, including its own fuzzy pass (e.g. ```elisp already resolves to
// Common Lisp via the substring alias `lisp`).
export function match_code_language(info: string): LanguageDescription | null {
  return (
    LanguageDescription.matchLanguageName(alias_wrappers, info, false) ??
    LanguageDescription.matchLanguageName(languages, info, true)
  );
}
