// Pure logic behind the webview→host whole-document write path (the
// `apply_full_replace` applier in provider.ts, invoked for every webview
// keystroke). Kept vscode-free — like image_paste.ts / styles_resolve.ts /
// outline_model.ts — so vitest can exercise the three moving parts (EOL
// translation, the whole-document replace range, and the URI guard) without a
// live TextDocument. The vscode wiring (WorkspaceEdit / applyEdit) stays in
// provider.ts and consumes this plan.
//
// Contract: SYNC-W-3 (translate LF → native EOL, replace the entire document
// range [positionAt(0), positionAt(getText().length)]), SYNC-W-4 (reject a
// target URI that is not the bound document), INV-SP-3 / SYNC-P-6 (line endings
// follow the TextDocument — LF↔native translation only), INV-SP-4 (a no-input
// echo translates back byte-identically).

import { lf_to_native } from '../sync/translate.js';

export interface FullReplaceTarget {
  // The bound document's URI string. The incoming update's target is compared
  // against this; a mismatch is never applied (SYNC-W-4).
  uri: string;
  // The document's native EOL — drives LF → native translation.
  eol: '\r\n' | '\n';
  // The CURRENT document's line count (always >= 1) and the length — in UTF-16
  // code units, EOL excluded — of its final line. Together these reproduce
  // `positionAt(getText().length)`, the end of the whole-document range, with no
  // vscode dependency: positionAt(0) is always (0,0) and positionAt(length) is
  // (lineCount - 1, lastLine.text.length).
  line_count: number;
  last_line_length: number;
}

interface ReplacePosition {
  line: number;
  character: number;
}

export type FullReplacePlan =
  | { kind: 'skip' }
  | {
      kind: 'replace';
      start: ReplacePosition;
      end: ReplacePosition;
      text: string;
    };

export function plan_full_replace(
  target: FullReplaceTarget,
  incoming_uri: string,
  lf_text: string,
): FullReplacePlan {
  // SYNC-W-4: an update routed to any URI other than the bound document is
  // dropped without applying.
  if (incoming_uri !== target.uri) return { kind: 'skip' };
  // SYNC-W-3 / INV-SP-3 / SYNC-P-6: translate the webview's LF text to the
  // document's native EOL. The translate module owns the lone-`\r` policy; this
  // path never re-normalizes.
  const text = lf_to_native(lf_text, target.eol);
  // SYNC-W-3: the replacement spans the ENTIRE current document — from
  // positionAt(0) to positionAt(getText().length).
  return {
    kind: 'replace',
    start: { line: 0, character: 0 },
    end: { line: target.line_count - 1, character: target.last_line_length },
    text,
  };
}
