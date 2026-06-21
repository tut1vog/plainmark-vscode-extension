import { Annotation } from '@codemirror/state';

// Tag for transactions that cross the main-view ⇆ cell-subview boundary.
// Subview's transactionExtender skips addToHistory.of(false) for these so the
// rebase ViewPlugin can sync the subview's doc without polluting
// the subview's history; main-view's mirror plugin will likewise skip these
// to break the ping-pong.
export const table_sync_annotation = Annotation.define<boolean>();
