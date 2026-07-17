import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import {
  EditorSelection,
  EditorState,
  type Extension,
  Facet,
  Prec,
  type Range,
  RangeSet,
  StateField,
  type Text,
  Transaction,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType, keymap } from '@codemirror/view';
import { make_cell_keymap } from './table_keymap.js';
import { show_table_context_menu } from './table_context_menu.js';
import { image_base_field } from './image.js';
import { cached_block_height, remember_block_height } from './widget_height_cache.js';
import { math_cache_field, math_cache_key, type MathResult, set_typeset_effect } from './math.js';
import {
  pointer_down_field,
  set_pointer_down,
} from '../decorations/pointer_state.js';
import {
  type TableModel,
  parse_cell_text,
  serialize_table,
} from './table_serialize.js';
import { emit_table_cell } from './table_inline_emit.js';
import { table_sync_annotation } from './table_sync_annotation.js';
import { create_logger } from '../../log.js';

const log = create_logger('widget');

// Cell-subview extensions are supplied by the host context (index.ts / tests / editor_extensions.ts)
// via this facet — breaks the table ⇆ editor_extensions import cycle while keeping AC2's
// "same extensions inside cells as in the main editor" guarantee.
export const cell_subview_extensions = Facet.define<Extension[], Extension[]>({
  combine: (values) => values[0] ?? [],
});

export type Alignment = 'left' | 'center' | 'right' | null;

export interface TableCellInfo {
  cell_from: number;
  cell_to: number;
  row_index: number;
  col_index: number;
}

export interface TableInfo {
  from: number;
  to: number;
  cells: TableCellInfo[];
  row_count: number;
  col_count: number;
  alignment: Alignment[];
}

interface TableCellNode {
  row_index: number;
  col_index: number;
  cell_node: SyntaxNode | null;
  range_from: number;
  range_to: number;
}

export interface TableExtraction {
  info: TableInfo;
  header_cells: TableCellNode[];
  body_cells: TableCellNode[];
}

function row_node_kind(name: string): 'header' | 'row' | null {
  if (name === 'TableHeader') return 'header';
  if (name === 'TableRow') return 'row';
  return null;
}

function extract_cell_ranges_in_row(row: SyntaxNode): Array<[number, number]> {
  // lezer-markdown emits one TableDelimiter per pipe; cell range = inter-pipe span (incl. padding); leading/trailing pipes optional in GFM.
  const delimiters: Array<[number, number]> = [];
  for (let c = row.firstChild; c; c = c.nextSibling) {
    if (c.name === 'TableDelimiter') delimiters.push([c.from, c.to]);
  }
  if (delimiters.length === 0) return [];

  const cells: Array<[number, number]> = [];
  const row_from = row.from;
  const row_to = row.to;

  if (delimiters[0][0] > row_from) {
    cells.push([row_from, delimiters[0][0]]);
  }
  for (let i = 0; i < delimiters.length - 1; i++) {
    cells.push([delimiters[i][1], delimiters[i + 1][0]]);
  }
  if (delimiters[delimiters.length - 1][1] < row_to) {
    cells.push([delimiters[delimiters.length - 1][1], row_to]);
  }
  return cells;
}

function find_cell_node(row: SyntaxNode, range_from: number, range_to: number): SyntaxNode | null {
  for (let c = row.firstChild; c; c = c.nextSibling) {
    if (c.name === 'TableCell' && c.from >= range_from && c.to <= range_to) return c;
  }
  return null;
}

function parse_alignment_marker(marker: string): Alignment {
  const left = marker.startsWith(':');
  const right = marker.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

function extract_alignment(table_node: SyntaxNode, doc: Text, col_count: number): Alignment[] {
  // The delimiter row is a direct TableDelimiter child of Table between TableHeader and the first TableRow.
  let delim_row: SyntaxNode | null = null;
  let seen_header = false;
  for (let c = table_node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'TableHeader') {
      seen_header = true;
      continue;
    }
    if (seen_header && c.name === 'TableDelimiter') {
      delim_row = c;
      break;
    }
  }
  const alignment: Alignment[] = Array.from({ length: col_count }, () => null);
  if (!delim_row) return alignment;
  const raw = doc.sliceString(delim_row.from, delim_row.to);
  const markers = raw
    .split('|')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  for (let c = 0; c < col_count; c++) {
    if (c < markers.length) alignment[c] = parse_alignment_marker(markers[c]);
  }
  return alignment;
}

export function extract_table_info(table_node: SyntaxNode, doc: Text): TableInfo {
  return extract_table_full(table_node, doc).info;
}

function extract_table_full(table_node: SyntaxNode, doc: Text): TableExtraction {
  const header_cells: TableCellNode[] = [];
  const body_cells: TableCellNode[] = [];
  let row_index = 0;
  let header_col_count = 0;
  // Track the last header/delimiter/row child's .to as the actual end of
  // structured table content. Lezer's Table.to can extend past the last row
  // when GFM absorbs a trailing non-row line (e.g., a single-char paragraph
  // below the table). Clamping info.to here keeps the block-replace decoration
  // scoped to the parsed rows; absorbed bytes remain caret-targetable doc lines.
  let last_row_to = table_node.from;

  for (let c = table_node.firstChild; c; c = c.nextSibling) {
    // The delimiter row is a direct TableDelimiter child of Table — structural content the clamp must include, else a header-only table ends at the header and its first edit duplicates the delimiter row as a phantom body row.
    if (c.name === 'TableDelimiter') {
      last_row_to = c.to;
      continue;
    }
    const kind = row_node_kind(c.name);
    if (!kind) continue;
    const row_cells = extract_cell_ranges_in_row(c);
    // Skip rows with no TableDelimiter children — Lezer's GFM grammar wraps
    // a trailing non-pipe line as TableRow when it absorbs into the Table
    // node; treating it as a row would extend last_row_to past the real table.
    if (row_cells.length === 0) continue;
    if (kind === 'header') header_col_count = row_cells.length;
    const target = kind === 'header' ? header_cells : body_cells;
    for (let col_index = 0; col_index < row_cells.length; col_index++) {
      const [from, to] = row_cells[col_index];
      const cell_node = find_cell_node(c, from, to);
      target.push({
        row_index,
        col_index,
        cell_node,
        range_from: from,
        range_to: to,
      });
    }
    last_row_to = c.to;
    row_index += 1;
  }

  // MC1: header column count wins. Drop body cells past header_col_count.
  const trimmed_body = body_cells.filter((c) => c.col_index < header_col_count);
  const trimmed_header = header_cells.filter((c) => c.col_index < header_col_count);

  const cells: TableCellInfo[] = [];
  for (const c of trimmed_header) {
    cells.push({
      cell_from: c.range_from,
      cell_to: c.range_to,
      row_index: c.row_index,
      col_index: c.col_index,
    });
  }
  for (const c of trimmed_body) {
    cells.push({
      cell_from: c.range_from,
      cell_to: c.range_to,
      row_index: c.row_index,
      col_index: c.col_index,
    });
  }

  // GFM §4.10: zero-length placeholders so toDOM emits a full row of <td>s for underfilled body rows.
  const present: Set<string> = new Set();
  const last_to_by_row: Map<number, number> = new Map();
  for (const c of trimmed_header) {
    present.add(`${c.row_index},${c.col_index}`);
    const prev_to = last_to_by_row.get(c.row_index) ?? table_node.from;
    if (c.range_to > prev_to) last_to_by_row.set(c.row_index, c.range_to);
  }
  for (const c of trimmed_body) {
    present.add(`${c.row_index},${c.col_index}`);
    const prev_to = last_to_by_row.get(c.row_index) ?? table_node.from;
    if (c.range_to > prev_to) last_to_by_row.set(c.row_index, c.range_to);
  }
  for (let r = 0; r < row_index; r++) {
    const synthetic_pos = last_to_by_row.get(r) ?? table_node.from;
    for (let c = 0; c < header_col_count; c++) {
      if (present.has(`${r},${c}`)) continue;
      const placeholder: TableCellNode = {
        row_index: r,
        col_index: c,
        cell_node: null,
        range_from: synthetic_pos,
        range_to: synthetic_pos,
      };
      (r === 0 ? trimmed_header : trimmed_body).push(placeholder);
      cells.push({
        cell_from: synthetic_pos,
        cell_to: synthetic_pos,
        row_index: r,
        col_index: c,
      });
    }
  }

  const alignment = extract_alignment(table_node, doc, header_col_count);

  return {
    info: {
      from: table_node.from,
      to: last_row_to,
      cells,
      row_count: row_index,
      col_count: header_col_count,
      alignment,
    },
    header_cells: trimmed_header,
    body_cells: trimmed_body,
  };
}

const LIST_OR_BLOCKQUOTE_PREFIX = /^(?:\s*(?:[-*+]|\d+[.)])\s|>)/;

function is_in_list_or_blockquote(state: EditorState, from: number): boolean {
  const line = state.doc.lineAt(from);
  return LIST_OR_BLOCKQUOTE_PREFIX.test(line.text);
}

// IL1 asymmetry: this returns list/blockquote-nested tables too — only
// build_table_decorations applies the is_in_list_or_blockquote guard — so a
// returned table may have no widget. Callers must defend (table_widget_rendered)
// before assuming a rendered table. A unit test pins this contract deliberately.
export function find_tables(state: EditorState): TableInfo[] {
  const tables: TableInfo[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'Document') return;
      if (node.name === 'Table') {
        try {
          tables.push(extract_table_info(node.node, state.doc));
        } catch (reason) {
          log.warn('table widget skipped', {
            from: node.from,
            to: node.to,
            reason: String(reason),
          });
        }
        return false;
      }
      if (node.node.parent?.name !== 'Document') return false;
      return;
    },
  });
  return tables;
}

// Inherits find_tables' IL1 asymmetry: may resolve a cell in a widget-less nested table.
export function lookup_cell_range(
  state: EditorState,
  table_from: number,
  row_index: number,
  col_index: number,
): { cell_from: number; cell_to: number } | null {
  for (const t of find_tables(state)) {
    if (t.from !== table_from) continue;
    const c = t.cells.find((cc) => cc.row_index === row_index && cc.col_index === col_index);
    if (!c) return null;
    return { cell_from: c.cell_from, cell_to: c.cell_to };
  }
  return null;
}

function alignment_signature(alignment: Alignment[]): string {
  return alignment.map((a) => a ?? 'n').join(',');
}

// Cells' trimmed text — included in eq() so swaps and any other content-only
// change invalidate the widget and force updateDOM (which also refreshes the
// container's widget ref, keeping listeners' widget_from_td lookups fresh).
function content_signature(cells: TableCellInfo[], doc: Text): string {
  return cells
    .map((c) => doc.sliceString(c.cell_from, c.cell_to).trim())
    .join('\x01');
}

function math_fingerprint_for_range(
  cache: Map<string, MathResult>,
  doc: Text,
  state: EditorState,
  table_from: number,
  table_to: number,
): string {
  const keys: string[] = [];
  syntaxTree(state).iterate({
    from: table_from,
    to: table_to,
    enter(node) {
      if (node.from < table_from || node.to > table_to) return;
      if (node.name === 'InlineMath' || node.name === 'BlockMath') {
        const first = node.node.firstChild;
        const last = node.node.lastChild;
        const src =
          first && last && first.from < last.from
            ? doc.sliceString(first.to, last.from)
            : doc.sliceString(node.from, node.to);
        const key = math_cache_key(node.name === 'BlockMath', src);
        if (cache.has(key)) keys.push(key);
      }
    },
  });
  keys.sort();
  return keys.join('|');
}

export function build_model_from_extraction(extraction: TableExtraction, doc: Text): TableModel {
  const { info, header_cells, body_cells } = extraction;
  const rows: string[][] = [];
  const ensure_row = (r: number) => {
    while (rows.length <= r) rows.push(Array.from({ length: info.col_count }, () => ''));
  };
  for (const c of header_cells) {
    ensure_row(c.row_index);
    rows[c.row_index][c.col_index] = parse_cell_text(
      doc.sliceString(c.range_from, c.range_to).trim(),
    );
  }
  for (const c of body_cells) {
    ensure_row(c.row_index);
    rows[c.row_index][c.col_index] = parse_cell_text(
      doc.sliceString(c.range_from, c.range_to).trim(),
    );
  }
  if (rows.length === 0) rows.push(Array.from({ length: info.col_count }, () => ''));
  return { rows, alignment: info.alignment, header_row_count: 1 };
}

function build_subview_extensions(state: EditorState, extra: Extension[] = []): Extension[] {
  const base = state.facet(cell_subview_extensions);
  return [
    ...base,
    // Main view owns the canonical history; every non-sync subview transaction
    // is tagged addToHistory.of(false) so the subview's local history stays
    // empty and a Mod-z fall-through to its historyKeymap is a no-op.
    EditorState.transactionExtender.of((tr) => {
      if (tr.annotation(table_sync_annotation)) return null;
      return { annotations: Transaction.addToHistory.of(false) };
    }),
    EditorView.theme({
      '&': { padding: '0', margin: '0' },
      '.cm-content': { padding: '0' },
      '.cm-line': { padding: '0' },
      '.cm-scroller': { overflow: 'visible', fontFamily: 'inherit' },
      '.cm-focused': { outline: 'none' },
      // lineWrapping's base theme puts anywhere-wrapping on .cm-content — match
      // the td defaults so wrapping doesn't shift when a cell activates.
      '.cm-content.cm-lineWrapping': {
        wordBreak: 'var(--plainmark-table-cell-word-break, normal)' as 'normal',
        overflowWrap: 'var(--plainmark-table-cell-overflow-wrap, break-word)' as 'break-word',
      },
    }),
    ...extra,
  ];
}

interface ActiveSubview {
  view: EditorView;
  main_view: EditorView;
  row_index: number;
  col_index: number;
  td: HTMLTableCellElement;
  subview_container: HTMLElement;
  detach: () => void;
}

// Snapshot of the active cell subview, keyed by the main view. The rebase
// ViewPlugin reads it to route an undo/redo (rebase in place, switch cell, or
// teardown); keying by view keeps two mounted main editors from sharing it.
export interface ActiveCellSnapshot {
  table_from: number;
  row: number;
  col: number;
  sub_view: EditorView;
}

const active_cell_snapshots = new WeakMap<EditorView, ActiveCellSnapshot>();

export function get_active_cell_snapshot(view: EditorView): ActiveCellSnapshot | null {
  return active_cell_snapshots.get(view) ?? null;
}

function set_active_cell_snapshot(view: EditorView, snapshot: ActiveCellSnapshot | null): void {
  if (snapshot === null) active_cell_snapshots.delete(view);
  else active_cell_snapshots.set(view, snapshot);
}

// CM6's updateDOM swaps tile.widget on existing DOM without re-binding listeners. Storing the current widget on the container lets listeners look it up at event time instead of closing over a stale instance.
type TableContainer = HTMLElement & { __plainmark_table_widget?: TableWidget };

function set_container_widget(container: HTMLElement, widget: TableWidget): void {
  (container as TableContainer).__plainmark_table_widget = widget;
}

function widget_from_td(td: HTMLElement): TableWidget | null {
  const container = td.closest('.plainmark-table-block') as TableContainer | null;
  return container?.__plainmark_table_widget ?? null;
}

// Continue the still-held press as a drag-select inside the freshly mounted
// subview. The activating mousedown was preventDefaulted and the subview is
// created a frame later (AC3 rAF), so the browser never armed its native
// drag-select for this gesture — drive it manually until release. Without this,
// click-drag-to-select fails until a second press lands on the live subview.
function start_cell_drag_select(sub: EditorView, anchor: number): () => void {
  const end_drag = (): void => {
    document.removeEventListener('mousemove', on_move);
    document.removeEventListener('mouseup', end_drag);
  };
  const on_move = (event: MouseEvent): void => {
    // Electron #17635: a release outside the webview iframe never delivers
    // mouseup here; a button-less move proves the press ended.
    if (event.buttons === 0) {
      end_drag();
      return;
    }
    const head = sub.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    if (head < 0) return;
    sub.dispatch({ selection: EditorSelection.range(anchor, head) });
  };
  document.addEventListener('mousemove', on_move);
  document.addEventListener('mouseup', end_drag);
  return end_drag;
}

// Rough a-priori row height (16px body × 1.5 line-height + 6px×2 cell padding +
// 1px border ≈ 37px). A fast scrollbar drag skips intermediate content, so the
// measured cache never warms for tables dragged past — this seeds CM6's height
// map from row_count alone; a rendered table replaces it with its real height.
const TABLE_ROW_HEIGHT_PX = 37;

export class TableWidget extends WidgetType {
  private active: ActiveSubview | null = null;
  // Activation is rAF-deferred; a later activation in the same frame must abort
  // the earlier one before it builds a subview, else the first leaks (orphaned
  // EditorView + DOM whose focusout handler no longer matches the live active).
  private activation_token = 0;

  constructor(
    readonly table: TableInfo,
    readonly math_cache: Map<string, MathResult>,
    readonly image_base: string | null,
    readonly math_fingerprint: string,
    readonly content_signature: string,
  ) {
    super();
  }

  eq(other: TableWidget): boolean {
    return (
      other.table.from === this.table.from &&
      other.table.row_count === this.table.row_count &&
      other.table.col_count === this.table.col_count &&
      alignment_signature(other.table.alignment) === alignment_signature(this.table.alignment) &&
      other.math_fingerprint === this.math_fingerprint &&
      other.content_signature === this.content_signature
    );
  }

  // Off-screen seed for CM6's height map; on-screen tables are still measured.
  get estimatedHeight(): number {
    const cached = cached_block_height(this.content_signature);
    return cached >= 0 ? cached : this.table.row_count * TABLE_ROW_HEIGHT_PX;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className = 'plainmark-table-block';
    container.dataset.tableFrom = String(this.table.from);
    set_container_widget(container, this);
    try {
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const tbody = document.createElement('tbody');
      table.appendChild(thead);
      table.appendChild(tbody);

      const rows: HTMLTableRowElement[] = [];
      for (let r = 0; r < this.table.row_count; r++) {
        const tr = document.createElement('tr');
        (r === 0 ? thead : tbody).appendChild(tr);
        rows.push(tr);
      }
      const tag = (r: number) => (r === 0 ? 'th' : 'td');

      const extraction = locate_table_extraction(view.state, this.table.from);
      for (const cell of this.table.cells) {
        const td = document.createElement(tag(cell.row_index)) as HTMLTableCellElement;
        td.dataset.rowIndex = String(cell.row_index);
        td.dataset.colIndex = String(cell.col_index);
        if (cell.cell_from === cell.cell_to) td.dataset.placeholder = 'underfill';
        const align = this.table.alignment[cell.col_index];
        if (align) td.style.textAlign = align;
        this.render_cell_contents(td, view, cell, extraction);
        this.bind_cell_focus(td, view, cell);
        this.bind_cell_contextmenu(td, view, cell);
        rows[cell.row_index].appendChild(td);
      }

      container.appendChild(table);
      remember_block_height(this.content_signature, container);
    } catch (reason) {
      log.warn('table widget toDOM failed', {
        from: this.table.from,
        to: this.table.to,
        reason: String(reason),
      });
    }
    return container;
  }

  updateDOM(dom: HTMLElement, view: EditorView, prev: TableWidget): boolean {
    if (!dom.classList.contains('plainmark-table-block')) return false;
    // dimension change → DOM rows/cols can't be reconciled in place; force CM6 to call toDOM.
    if (
      prev instanceof TableWidget &&
      (prev.table.row_count !== this.table.row_count ||
        prev.table.col_count !== this.table.col_count)
    ) {
      return false;
    }
    // Active state lives on the container's last-bound widget, not on `prev`.
    // When `eq()` returns true between rebuilds (e.g. typing a space whose
    // trimmed cell text matches the previous trimmed cell text), CM6 swaps
    // the widget reference without calling updateDOM, stranding the active
    // state on an intermediate widget. The container's __plainmark_table_widget
    // is only updated by toDOM / updateDOM, so it still points at the widget
    // that owns the active subview. Without this, the active-cell skip below
    // misses, and render_cell_contents wipes the subview DOM.
    const live_widget = (dom as TableContainer).__plainmark_table_widget;
    if (live_widget && live_widget !== this && live_widget.active) {
      this.active = live_widget.active;
      live_widget.active = null;
    } else if (prev instanceof TableWidget && prev.active) {
      this.active = prev.active;
      prev.active = null;
    }
    dom.dataset.tableFrom = String(this.table.from);
    set_container_widget(dom, this);
    try {
      const extraction = locate_table_extraction(view.state, this.table.from);
      const tds = dom.querySelectorAll<HTMLTableCellElement>('th, td');
      for (const td of Array.from(tds)) {
        const r = Number(td.dataset.rowIndex ?? '-1');
        const c = Number(td.dataset.colIndex ?? '-1');
        const cell = this.table.cells.find(
          (cc) => cc.row_index === r && cc.col_index === c,
        );
        if (!cell) continue;
        if (cell.cell_from === cell.cell_to) td.dataset.placeholder = 'underfill';
        else delete td.dataset.placeholder;
        if (this.active && this.active.row_index === r && this.active.col_index === c) continue;
        const align = this.table.alignment[cell.col_index];
        td.style.textAlign = align ?? '';
        this.render_cell_contents(td, view, cell, extraction);
      }
      return true;
    } catch (reason) {
      log.warn('table updateDOM failed', {
        from: this.table.from,
        to: this.table.to,
        reason: String(reason),
      });
      return false;
    }
  }

  destroy(dom: HTMLElement): void {
    // an eq()-true rebuild swaps the tile's widget without updateDOM, stranding `active` on the container's last-bound widget — resolve the live owner
    const live = (dom as TableContainer).__plainmark_table_widget;
    // invalidate any rAF-deferred activation so it can't mount into detached DOM
    this.activation_token++;
    if (live && live !== this) live.activation_token++;
    const owner = this.active ? this : live?.active ? live : null;
    if (!owner?.active) return;
    const main_view = owner.active.main_view;
    owner.active.detach();
    owner.active.view.destroy();
    owner.active = null;
    set_active_cell_snapshot(main_view, null);
    main_view.dom.removeAttribute('data-plainmark-cell-active');
  }

  ignoreEvent(): boolean {
    return false;
  }

  // Resolve a position inside the block-replace to the matching <td>'s rect so
  // drawSelection renders the caret inside the cell instead of CM6's default
  // flatten-to-widget-right-bottom. See `coordsInWidget` in @codemirror/view's
  // tile.ts: a non-null return from this method overrides the flatten path.
  coordsAt(dom: HTMLElement, pos: number, _side: number): {
    top: number;
    bottom: number;
    left: number;
    right: number;
  } | null {
    const abs_pos = this.table.from + pos;
    const cell = this.table.cells.find(
      (c) => abs_pos >= c.cell_from && abs_pos < c.cell_to,
    );
    if (!cell) return null;
    const td = dom.querySelector(
      `[data-row-index="${cell.row_index}"][data-col-index="${cell.col_index}"]`,
    ) as HTMLElement | null;
    if (!td) return null;
    return td.getBoundingClientRect();
  }

  private render_cell_contents(
    td: HTMLTableCellElement,
    view: EditorView,
    cell: TableCellInfo,
    precomputed?: TableExtraction | null,
  ): void {
    try {
      // Freshly-located, never this.table.cells (stale ranges slice in neighbours' content); loop callers pass one shared extraction so the doc tree-walk runs once, not per cell.
      const extraction =
        precomputed !== undefined
          ? precomputed
          : locate_table_extraction(view.state, this.table.from);
      if (!extraction) return;
      const all = [...extraction.header_cells, ...extraction.body_cells];
      const fresh = all.find(
        (c) => c.row_index === cell.row_index && c.col_index === cell.col_index,
      );
      if (!fresh) return;

      while (td.firstChild) td.removeChild(td.firstChild);
      if (fresh.cell_node && fresh.cell_node.name === 'TableCell') {
        const fragment = emit_table_cell(
          fresh.cell_node,
          view.state.doc,
          this.math_cache,
          this.image_base,
        );
        td.appendChild(fragment);
      }
      // Empty cells render as zero-height boxes without a line-box anchor; a
      // zero-width space gives the cell one line-height worth of content.
      if (!td.hasChildNodes() || td.textContent === '') {
        td.appendChild(document.createTextNode('\u200B'));
      }
    } catch (reason) {
      log.warn('table cell emit failed', {
        from: cell.cell_from,
        to: cell.cell_to,
        reason: String(reason),
      });
    }
  }

  private bind_cell_focus(
    td: HTMLTableCellElement,
    view: EditorView,
    cell: TableCellInfo,
  ): void {
    td.addEventListener('mousedown', (ev) => {
      // look the widget up at event time so updateDOM-driven swaps reach us
      const widget = widget_from_td(td) ?? this;
      if (
        widget.active &&
        widget.active.row_index === cell.row_index &&
        widget.active.col_index === cell.col_index
      ) {
        return;
      }
      ev.preventDefault();
      widget.activate_cell(td, view, cell.row_index, cell.col_index, {
        x: ev.clientX,
        y: ev.clientY,
      });
    });
  }

  private bind_cell_contextmenu(
    td: HTMLTableCellElement,
    view: EditorView,
    cell: TableCellInfo,
  ): void {
    td.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      const widget = widget_from_td(td) ?? this;
      show_table_context_menu({
        main_view: view,
        table_from: widget.table.from,
        row: cell.row_index,
        col: cell.col_index,
        row_count: widget.table.row_count,
        col_count: widget.table.col_count,
        anchor: { x: ev.clientX, y: ev.clientY },
      });
    });
  }

  activate_cell(
    td: HTMLTableCellElement,
    main_view: EditorView,
    row_index: number,
    col_index: number,
    click_pos?: { x: number; y: number },
  ): void {
    if (this.active) this.teardown_active(main_view);

    const token = ++this.activation_token;
    requestAnimationFrame(() => {
      if (token !== this.activation_token) return;
      if (!td.isConnected) return;
      const range = lookup_cell_range(main_view.state, this.table.from, row_index, col_index);
      if (!range) return;
      // Seed the main selection inside the cell on every activation (click, nav,
      // undo landing, structural re-focus). Selection-only → no undo step
      // (INV-UNDO-1) and no source write (TBL-SP-2). This makes the first
      // in-cell keystroke's history startSelection table-local, so undo restores
      // a caret into the table instead of doc offset 0 (RC3); and on a focus
      // drop the main caret renders in-cell (TableWidget.coordsAt) rather than at
      // document start. The data-plainmark-cell-active CSS hides the main cursor
      // while the cell is active, so there is no visible double caret.
      main_view.dispatch({
        selection: { anchor: Math.min(range.cell_from, main_view.state.doc.length) },
      });
      const raw = main_view.state.sliceDoc(range.cell_from, range.cell_to);
      const logical = parse_cell_text(raw.trim());

      const subview_container = document.createElement('div');
      subview_container.className = 'plainmark-table-cell-edit';

      const sub = this.build_cell_subview({
        td,
        main_view,
        row_index,
        col_index,
        logical,
        subview_container,
      });

      while (td.firstChild) td.removeChild(td.firstChild);
      td.appendChild(subview_container);
      sub.focus();
      // Toggled in lockstep with subview lifecycle; CSS rule in
      // `editor_extensions_core` hides the main view's direct-child
      // `.cm-cursor` while a cell is active (double-caret defense).
      main_view.dom.setAttribute('data-plainmark-cell-active', '');

      let drag_cleanup: (() => void) | null = null;
      if (click_pos) {
        const main_pointer_down =
          main_view.state.field(pointer_down_field, false) ?? false;
        const anchor = this.seed_click_caret(sub, click_pos, main_pointer_down);
        if (main_pointer_down) drag_cleanup = start_cell_drag_select(sub, anchor);
      }

      const blur_handler = (): void => {
        setTimeout(() => {
          // look the widget up at callback time so updateDOM-driven swaps reach us
          const widget = widget_from_td(td) ?? this;
          if (!widget.active || widget.active.view !== sub) return;
          if (subview_container.contains(document.activeElement)) return;
          widget.teardown_active(main_view);
        }, 0);
      };
      sub.contentDOM.addEventListener('focusout', blur_handler);

      const owner = widget_from_td(td) ?? this;
      owner.active = {
        view: sub,
        main_view,
        row_index,
        col_index,
        td,
        subview_container,
        detach: () => {
          sub.contentDOM.removeEventListener('focusout', blur_handler);
          drag_cleanup?.();
        },
      };
      set_active_cell_snapshot(main_view, {
        table_from: this.table.from,
        row: row_index,
        col: col_index,
        sub_view: sub,
      });
    });
  }

  private build_cell_subview(args: {
    td: HTMLTableCellElement;
    main_view: EditorView;
    row_index: number;
    col_index: number;
    logical: string;
    subview_container: HTMLElement;
  }): EditorView {
    const { td, main_view, row_index, col_index, logical, subview_container } = args;

    const cell_edit_listener = EditorView.updateListener.of((u) => {
      if (!u.docChanged) return;
      // Skip rebase-driven sync transactions — re-dispatching them on the
      // main view would ping-pong the rebase plugin.
      for (const tr of u.transactions) {
        if (tr.annotation(table_sync_annotation)) return;
      }
      // look the widget up at event time so updateDOM-driven swaps reach us
      const widget = widget_from_td(td) ?? this;
      widget.handle_cell_edit(main_view, sub, row_index, col_index);
    });

    // resolve table.from at keystroke time — edits above the table shift it without rebuilding the subview's closures
    const live_table_from = (): number => (widget_from_td(td) ?? this).table.from;

    const cell_keymap = keymap.of(
      make_cell_keymap({
        main_view,
        get table_from() {
          return live_table_from();
        },
        get_active: () => {
          // look the widget up at event time so updateDOM-driven swaps reach us
          const widget = widget_from_td(td) ?? this;
          if (!widget.active) return null;
          return {
            row_index: widget.active.row_index,
            col_index: widget.active.col_index,
          };
        },
        request_focus: (row, col) => request_cell_focus(main_view, live_table_from(), row, col),
        teardown_now: () => {
          // look the widget up at event time so updateDOM-driven swaps reach us
          const widget = widget_from_td(td) ?? this;
          if (widget.active) widget.teardown_active(main_view);
        },
      }),
    );

    const sub = new EditorView({
      state: EditorState.create({
        doc: logical,
        // Caret defaults to end-of-cell on activation (mirrors Excel/Sheets
        // Tab-into-cell convention). Click activation refines this below
        // via posAtCoords.
        selection: { anchor: logical.length },
        extensions: build_subview_extensions(main_view.state, [
          Prec.high(cell_keymap),
          cell_edit_listener,
        ]),
      }),
      parent: subview_container,
    });
    return sub;
  }

  // Click activation: refine caret to the character nearest the mouse and seed
  // the cell's pointer_state. posAtCoords with `precise: false` falls back to the
  // closest position when the click lands past the text (common for short text in
  // wide cells). Out-of-bounds click returns -1, leaving the default end-of-cell.
  //
  // Cell creation is rAF-deferred from the mousedown, so the cell's pointer_state
  // never saw the activating press; without seeding it, the reveal rule reads
  // pointer_down=false and reveals markers immediately, defeating "reveal on
  // release" for activation clicks. The cell's own document-mouseup listener
  // clears the seeded latch on release. Returns the drag-select anchor.
  private seed_click_caret(
    sub: EditorView,
    click_pos: { x: number; y: number },
    main_pointer_down: boolean,
  ): number {
    const pos = sub.posAtCoords(click_pos, false);
    const valid_pos = pos >= 0 && pos <= sub.state.doc.length;
    if (valid_pos || main_pointer_down) {
      sub.dispatch({
        ...(valid_pos ? { selection: { anchor: pos } } : {}),
        effects: main_pointer_down ? [set_pointer_down.of(true)] : [],
      });
    }
    return valid_pos ? pos : sub.state.doc.length;
  }

  private handle_cell_edit(
    main_view: EditorView,
    sub: EditorView,
    row_index: number,
    col_index: number,
  ): void {
    try {
      const extraction = locate_table_extraction(main_view.state, this.table.from);
      if (!extraction) return;
      const model = build_model_from_extraction(extraction, main_view.state.doc);
      const cell_text = sub.state.doc.toString();
      if (row_index < model.rows.length && col_index < model.rows[row_index].length) {
        model.rows[row_index][col_index] = cell_text;
      }
      const serialized = serialize_table(model);
      const table_from = extraction.info.from;
      const table_to = extraction.info.to;
      const doc_len = main_view.state.doc.length;
      // TA2 — inject one trailing `\n` only when there's no `\n` immediately
      // after the table. A single `\n` suffices (last_row_to is clamped at the
      // last pipe-row, so absorbed lines stay caret-targetable); forcing `\n\n`
      // would visibly push the user's content down on every cell edit.
      const next_byte = table_to < doc_len ? main_view.state.doc.sliceString(table_to, table_to + 1) : '';
      const ta2_needed = next_byte !== '\n';
      const insert = ta2_needed ? serialized + '\n' : serialized;
      // Pin main selection at table_from — CM6's default change-mapping would drift selection inside a replaced range to the end of inserted text, leaving the post-undo caret past the table.
      main_view.dispatch({
        changes: { from: table_from, to: table_to, insert },
        selection: { anchor: table_from },
        annotations: [Transaction.userEvent.of('input')],
      });
    } catch (reason) {
      log.error('table cell dispatch failed', {
        from: this.table.from,
        to: this.table.to,
        reason: String(reason),
      });
      document.dispatchEvent(
        new CustomEvent('plainmark-table-edit-error', {
          bubbles: true,
          detail: { reason: String(reason) },
        }),
      );
    }
  }

  private teardown_active(view: EditorView): void {
    if (!this.active) return;
    const { view: sub, td, row_index, col_index, detach } = this.active;
    detach();
    sub.destroy();
    this.active = null;
    set_active_cell_snapshot(view, null);
    while (td.firstChild) td.removeChild(td.firstChild);
    const cell = this.table.cells.find(
      (cc) => cc.row_index === row_index && cc.col_index === col_index,
    );
    if (cell) this.render_cell_contents(td, view, cell);
    view.dom.removeAttribute('data-plainmark-cell-active');
  }
}

// requestMeasure straddles the rebuild — read phase queries the post-rebuild DOM, write phase activates.
export function request_cell_focus(
  main_view: EditorView,
  table_from: number,
  row: number,
  col: number,
): void {
  main_view.requestMeasure({
    read: () =>
      main_view.dom.querySelector(
        `.plainmark-table-block[data-table-from="${table_from}"] [data-row-index="${row}"][data-col-index="${col}"]`,
      ) as HTMLTableCellElement | null,
    write: (td) => {
      if (!td) return;
      const widget = widget_from_td(td);
      if (!widget) return;
      widget.activate_cell(td, main_view, row, col);
    },
  });
}

// Like find_tables, skips the IL1 guard — may locate a widget-less nested table.
export function locate_table_extraction(
  state: EditorState,
  table_from: number,
): TableExtraction | null {
  let found: TableExtraction | null = null;
  syntaxTree(state).iterate({
    enter(node) {
      if (found) return false;
      if (node.name === 'Document') return;
      if (node.name === 'Table' && node.from === table_from) {
        try {
          found = extract_table_full(node.node, state.doc);
        } catch {
          // FAIL1: leave found as null; caller skips dispatch.
        }
        return false;
      }
      if (node.node.parent?.name !== 'Document') return false;
      return;
    },
  });
  return found;
}

function build_table_decorations(state: EditorState): DecorationSet {
  const cache = state.field(math_cache_field, false) ?? new Map<string, MathResult>();
  const image_base = state.field(image_base_field, false) ?? null;
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'Document') return;
      if (node.name === 'Table') {
        try {
          // IL1: the sole gate that suppresses widgets for nested tables; the
          // find_tables/locate_table_extraction extract path does not mirror it.
          if (is_in_list_or_blockquote(state, node.from)) {
            return false;
          }
          const info = extract_table_info(node.node, state.doc);
          const fingerprint = math_fingerprint_for_range(
            cache,
            state.doc,
            state,
            info.from,
            info.to,
          );
          const csig = content_signature(info.cells, state.doc);
          ranges.push(
            Decoration.replace({
              block: true,
              widget: new TableWidget(info, cache, image_base, fingerprint, csig),
            }).range(info.from, info.to),
          );
        } catch (reason) {
          log.warn('table widget skipped', {
            from: node.from,
            to: node.to,
            reason: String(reason),
          });
        }
        return false;
      }
      if (node.node.parent?.name !== 'Document') return false;
      return;
    },
  });
  return RangeSet.of(ranges, true);
}

export const table_widgets_field = StateField.define<DecorationSet>({
  create: (state) => build_table_decorations(state),
  update: (value, tr) => {
    const cache_effect = tr.effects.some((e) => e.is(set_typeset_effect));
    // Lazy/background parsing extends the tree via effect-only transactions; rebuild on tree advance or a deep table never widgetizes until edited.
    const tree_advanced = syntaxTree(tr.startState) !== syntaxTree(tr.state);
    if (tr.docChanged || cache_effect || tree_advanced) return build_table_decorations(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const table_theme = EditorView.theme({
  '.plainmark-table-block': {
    // Padding (not margin) so CM6's height map matches the rendered DOM.
    display: 'block',
    overflowX: 'auto',
    width: '100%',
    maxWidth: '100%',
    padding: 'var(--plainmark-table-margin, 0.5em 0)',
  },
  '.plainmark-table-block table': {
    borderCollapse: 'collapse',
    width: 'var(--plainmark-table-width, 100%)',
    tableLayout: 'var(--plainmark-table-layout, auto)' as 'auto',
  },
  '.plainmark-table-block th, .plainmark-table-block td': {
    border: '1px solid var(--plainmark-table-border-color, var(--vscode-widget-border, currentColor))',
    padding: 'var(--plainmark-table-cell-padding, 6px 13px)',
    minWidth: 'var(--plainmark-table-cell-min-width, 2em)',
    wordBreak: 'var(--plainmark-table-cell-word-break, normal)' as 'normal',
    // break-word (not the inherited `anywhere`) keeps min-content at longest-word
    // width, so auto layout never squeezes a column into mid-word breaks.
    overflowWrap: 'var(--plainmark-table-cell-overflow-wrap, break-word)' as 'break-word',
    verticalAlign: 'top',
  },
  '.plainmark-table-block th': {
    fontWeight: 'var(--plainmark-table-header-weight, 600)',
  },
  // GitHub-style alternating row stripe — CSS on rendered DOM only, no source-byte mutation.
  '.plainmark-table-block tbody tr:nth-child(even)': {
    background:
      'var(--plainmark-table-row-alt-background, color-mix(in srgb, var(--vscode-foreground) 4%, transparent))',
  },
  '.plainmark-table-block img': {
    maxWidth: '100%',
    height: 'auto',
  },
});

export const table_extension: Extension = [table_widgets_field, table_theme];
