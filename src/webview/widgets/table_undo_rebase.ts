import { Transaction } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { ViewPlugin, type ViewUpdate } from '@codemirror/view';
import {
  type ActiveCellSnapshot,
  type TableExtraction,
  find_tables,
  get_active_cell_snapshot,
  locate_table_extraction,
  request_cell_focus,
} from './table.js';
import { parse_cell_text } from './table_serialize.js';
import { table_sync_annotation } from './table_sync_annotation.js';
import { syncAnnotation } from '../sync.js';

interface Landing {
  table_from: number;
  row: number;
  col: number;
}

function cell_text_map(ext: TableExtraction, state: EditorState): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of [...ext.header_cells, ...ext.body_cells]) {
    map.set(
      `${c.row_index}:${c.col_index}`,
      state.doc.sliceString(c.range_from, c.range_to).trim(),
    );
  }
  return map;
}

export function find_differing_cell(
  pre: EditorState,
  pre_ext: TableExtraction,
  post: EditorState,
  post_ext: TableExtraction,
): { row: number; col: number } | null {
  const pre_text = cell_text_map(pre_ext, pre);
  for (const c of [...post_ext.header_cells, ...post_ext.body_cells]) {
    const key = `${c.row_index}:${c.col_index}`;
    const post_str = post.doc.sliceString(c.range_from, c.range_to).trim();
    const pre_str = pre_text.get(key);
    if (pre_str !== post_str) return { row: c.row_index, col: c.col_index };
    pre_text.delete(key);
  }
  // Cells present only in pre (rows removed by undo). Reactivate at the nearest
  // still-existing cell.
  if (pre_text.size > 0) {
    const first_key = pre_text.keys().next().value as string;
    const [r_raw, c_raw] = first_key.split(':');
    const r = Number(r_raw);
    const c = Number(c_raw);
    const adj_row = Math.max(0, Math.min(r, post_ext.info.row_count - 1));
    const adj_col = Math.max(0, Math.min(c, post_ext.info.col_count - 1));
    if (Number.isFinite(adj_row) && Number.isFinite(adj_col)) {
      return { row: adj_row, col: adj_col };
    }
  }
  return null;
}

// Find the post-state table corresponding to a pre-state table_from. Uses the
// transaction's change mapping; falls back to a same-position lookup if the
// mapped position doesn't land on a table start (covers undo/redo cases where
// the table itself shifted minimally).
function locate_post_table(
  pre_table_from: number,
  changes: { mapPos: (pos: number, assoc?: number) => number },
  post: EditorState,
): TableExtraction | null {
  const mapped = changes.mapPos(pre_table_from, -1);
  const at_mapped = locate_table_extraction(post, mapped);
  if (at_mapped) return at_mapped;
  // An insertion exactly at the table start leaves the assoc -1 mapping
  // before the inserted text — probe the after-side too.
  const mapped_after = changes.mapPos(pre_table_from, 1);
  if (mapped_after !== mapped) {
    const at_after = locate_table_extraction(post, mapped_after);
    if (at_after) return at_after;
  }
  const at_orig = locate_table_extraction(post, pre_table_from);
  if (at_orig) return at_orig;
  return null;
}

function rebase_subview_to_cell(
  snapshot: ActiveCellSnapshot,
  post: EditorState,
  post_ext: TableExtraction,
  row: number,
  col: number,
): void {
  const cell = post_ext.info.cells.find((c) => c.row_index === row && c.col_index === col);
  if (!cell) return;
  const raw = post.doc.sliceString(cell.cell_from, cell.cell_to).trim();
  const logical = parse_cell_text(raw);
  const sub = snapshot.sub_view;
  if (sub.state.doc.toString() === logical) return;
  const head = Math.min(sub.state.selection.main.head, logical.length);
  sub.dispatch({
    changes: { from: 0, to: sub.state.doc.length, insert: logical },
    // Pin the caret — a whole-doc replace otherwise maps an empty cursor to an assoc-dependent doc edge, drifting it on rebase.
    selection: { anchor: head },
    annotations: [
      table_sync_annotation.of(true),
      Transaction.addToHistory.of(false),
    ],
  });
  // Refocus — a multi-line→single-line cell shrink on undo can drop the subview's `.cm-focused`, which hides drawSelection's caret entirely.
  sub.focus();
}

// Snapshot null + undo lands inside an existing table → find the cell to
// reactivate. The change ranges over a table are the whole serialized table on
// either side, so we identify the cell by diffing pre/post trimmed cell text
// table-by-table.
function find_landing_no_snapshot(pre: EditorState, post: EditorState): Landing | null {
  const post_tables = find_tables(post);
  if (post_tables.length === 0) return null;
  const pre_tables = find_tables(pre);
  for (const pt of post_tables) {
    const post_ext = locate_table_extraction(post, pt.from);
    if (!post_ext) continue;
    let best_pre: { from: number; dist: number } | null = null;
    for (const prt of pre_tables) {
      const dist = Math.abs(prt.from - pt.from);
      if (best_pre === null || dist < best_pre.dist) best_pre = { from: prt.from, dist };
    }
    if (!best_pre) continue;
    const pre_ext = locate_table_extraction(pre, best_pre.from);
    if (!pre_ext) continue;
    const diff = find_differing_cell(pre, pre_ext, post, post_ext);
    if (diff !== null) {
      return { table_from: pt.from, row: diff.row, col: diff.col };
    }
  }
  return null;
}

export const table_undo_rebase = ViewPlugin.fromClass(
  class {
    update(vu: ViewUpdate): void {
      for (const tr of vu.transactions) {
        if (tr.isUserEvent('undo') || tr.isUserEvent('redo')) {
          this.process(vu, tr);
          // One undo/redo per update is the common case; processing more would
          // chase a moving target.
          return;
        }
        if (tr.annotation(syncAnnotation) === true && tr.docChanged) {
          this.process_sync(vu, tr);
          return;
        }
      }
    }

    // A host sync rewrites the source under the active cell while updateDOM
    // skips that cell — without a rebase the next in-cell keystroke writes the
    // stale subview text back, silently reverting the external edit.
    private process_sync(vu: ViewUpdate, tr: Transaction): void {
      const snapshot = get_active_cell_snapshot(vu.view);
      if (snapshot === null) return;
      const post = vu.state;
      const post_ext = locate_post_table(snapshot.table_from, tr.changes, post);
      // Table deleted by the sync — TableWidget.destroy tears the subview down.
      if (post_ext === null) return;
      // Keep the snapshot resolvable for the next sync/undo after the table shifts.
      snapshot.table_from = post_ext.info.from;
      if (
        snapshot.row >= post_ext.info.row_count ||
        snapshot.col >= post_ext.info.col_count
      ) {
        // Cell gone — the dimension-change rebuild destroys the subview.
        return;
      }
      rebase_subview_to_cell(snapshot, post, post_ext, snapshot.row, snapshot.col);
    }

    private process(vu: ViewUpdate, tr: Transaction): void {
      const pre = vu.startState;
      const post = vu.state;
      const snapshot = get_active_cell_snapshot(vu.view);

      if (snapshot === null) {
        const landing = find_landing_no_snapshot(pre, post);
        if (landing !== null) {
          request_cell_focus(vu.view, landing.table_from, landing.row, landing.col);
        }
        return;
      }

      const post_ext = locate_post_table(snapshot.table_from, tr.changes, post);
      if (post_ext === null) {
        // Table no longer exists post-undo (e.g., reverting EB autocomplete).
        // TableWidget.destroy clears the snapshot during the decoration update.
        return;
      }

      const pre_ext = locate_table_extraction(pre, snapshot.table_from);
      const diff =
        pre_ext !== null ? find_differing_cell(pre, pre_ext, post, post_ext) : null;

      // No detectable cell change — content already matches; nothing to do.
      if (diff === null) return;

      const same_table = post_ext.info.from === snapshot.table_from;
      const same_cell =
        same_table && diff.row === snapshot.row && diff.col === snapshot.col;

      // A dimension-changing undo/redo (e.g. reverting an insert/delete row/col
      // — reachable while a cell is active since RC2 re-focuses after structural
      // ops) rebuilds the widget: updateDOM bails on a row/col-count change, so
      // toDOM destroys the active subview. An in-place rebase can't survive
      // that, so reactivate the landing cell after the rebuild instead.
      const dims_changed =
        pre_ext === null ||
        pre_ext.info.row_count !== post_ext.info.row_count ||
        pre_ext.info.col_count !== post_ext.info.col_count;

      if (same_cell && !dims_changed) {
        rebase_subview_to_cell(snapshot, post, post_ext, diff.row, diff.col);
        return;
      }

      // Different cell, or a dimension change that will destroy the subview —
      // switch/reactivate by activating the landing cell. The widget's
      // activate_cell tears down any current subview first.
      request_cell_focus(vu.view, post_ext.info.from, diff.row, diff.col);
    }
  },
);
