import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { languages } from '@codemirror/language-data';
import { alias_wrappers } from '../language_aliases.js';

// CBLK-I-15 trigger: the text before the caret is an opening fence — optional
// blockquote markers, 0–3 spaces of indent, a run of >=3 backticks or tildes —
// followed by a partial tag with the caret at its end. Group 1 spans everything
// before the tag (its length locates `from`); group 2 is the tag typed so far.
// A space ends the match, so completion covers only the first info-string word.
const FENCE_BEFORE_RE = /^((?:\s*>\s?)*\s{0,3}(?:`{3,}|~{3,}))([^\s`~]*)$/;

// CBLK-I-16 — the suggestion list is DERIVED from the registries the
// CBLK-R-12/R-16 matcher resolves, never separately curated: every stock
// @codemirror/language-data name and alias, plus every surviving ADR-0009
// alias-layer tag, lower-cased and deduplicated (first entry wins). `mermaid`
// is added first: whatever the registry says, Plainmark cedes that fence to
// the diagram widget (CBLK-E-3).
function build_options(): readonly Completion[] {
  const seen = new Set<string>();
  const options: Completion[] = [];
  const add = (tag: string, detail: string): void => {
    const label = tag.toLowerCase();
    if (seen.has(label)) return;
    seen.add(label);
    options.push({ label, detail });
  };
  add('mermaid', 'Mermaid diagram');
  for (const lang of [...languages, ...alias_wrappers]) {
    add(lang.name, lang.name);
    for (const alias of lang.alias) add(alias, lang.name);
  }
  return options;
}

const OPTIONS = build_options();

export function codeblock_completions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const m = FENCE_BEFORE_RE.exec(line.text.slice(0, context.pos - line.from));
  if (!m) return null;
  // A bare fence pops nothing while typing: the third backtick just fired the
  // CBLK-I-11 auto-pair, and Enter must stay a plain newline into the block —
  // not accept a spurious language. Explicit invoke still offers the full list.
  if (m[2].length === 0 && !context.explicit) return null;
  return { from: line.from + m[1].length, options: OPTIONS };
}
