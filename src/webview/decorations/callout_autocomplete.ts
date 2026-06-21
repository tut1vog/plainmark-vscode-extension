import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { CANONICAL_TITLE_BY_TYPE, KNOWN_TYPES } from './callout_detect.js';

const TRIGGER_RE = /^(?:\s*>\s?)+\[$/;

export function callout_completions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  if (!TRIGGER_RE.test(before)) return null;
  return {
    from: context.pos,
    options: KNOWN_TYPES.map((type) => {
      const upper = type.toUpperCase();
      return {
        label: `!${upper}]`,
        detail: CANONICAL_TITLE_BY_TYPE[type],
        apply: `!${upper}] `,
      };
    }),
  };
}
