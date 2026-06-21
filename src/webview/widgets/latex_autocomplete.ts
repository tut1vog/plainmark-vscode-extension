import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  acceptCompletion,
  completionStatus,
  snippet,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { Command } from '@codemirror/view';
import { LATEX_COMMANDS } from './latex_commands.js';

const COMMAND_TOKEN = /\\[a-zA-Z]*/;
const COMMAND_RUN = /\\[a-zA-Z]+/g;

function in_math_node(state: EditorState, pos: number): boolean {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent!) {
    if (node.name === 'InlineMath' || node.name === 'BlockMath') return true;
  }
  return false;
}

// Frequency of each `\command` run within the document's math ranges. Recomputed per
// invocation (math content is small; a doc-change-keyed cache would invalidate every
// keystroke while completion is active anyway).
function math_command_counts(state: EditorState): Map<string, number> {
  const counts = new Map<string, number>();
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'InlineMath' && node.name !== 'BlockMath') return undefined;
      const text = state.doc.sliceString(node.from, node.to);
      for (const m of text.matchAll(COMMAND_RUN)) {
        counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
      }
      return false;
    },
  });
  return counts;
}

export function latex_completions(context: CompletionContext): CompletionResult | null {
  const token = context.matchBefore(COMMAND_TOKEN);
  if (!token) return null;
  // `\` is a non-word char, so auto-typing reaches this only with at least one letter;
  // the explicit-invoke path (Ctrl-Space on a bare `\`) still offers the full list.
  if (token.text.length < 2 && !context.explicit) return null;
  if (!in_math_node(context.state, context.pos)) return null;

  const counts = math_command_counts(context.state);
  const options: Completion[] = LATEX_COMMANDS.map((cmd) => {
    const count = counts.get(cmd.label) ?? 0;
    return {
      label: cmd.label,
      detail: cmd.glyph,
      apply: cmd.template ? snippet(cmd.template) : undefined,
      boost: count > 0 ? Math.min(99, count) : undefined,
    };
  });

  return { from: token.from, options };
}

// Tab accepts the popup only inside math, leaving callout/table popups (Enter-only)
// and Tab's other roles (snippet-field navigation, indentation) untouched.
export const accept_latex_completion_on_tab: Command = (view) => {
  if (completionStatus(view.state) !== 'active') return false;
  if (!in_math_node(view.state, view.state.selection.main.head)) return false;
  return acceptCompletion(view);
};
