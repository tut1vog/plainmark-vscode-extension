export interface TableModel {
  rows: string[][];
  alignment: ('left' | 'center' | 'right' | null)[];
  header_row_count: 1;
}

const encoder = new TextEncoder();

function byte_length(text: string): number {
  return encoder.encode(text).length;
}

export function escape_cell_text(text: string): string {
  // Escape `\` before `|`: GFM consumes a backslash before any ASCII punctuation, so a lone `\|` round-trips as a delimiter and splits the cell.
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>');
}

// Render (table_inline_emit BR1) and edit (parse_cell_text) must agree on what
// counts as a <br>, including case — <BR> renders as a break, so it must also
// edit as one.
export const BR_HTML_SOURCE = String.raw`<br\s*/?>`;

export function parse_cell_text(raw: string): string {
  return raw.replace(new RegExp(BR_HTML_SOURCE, 'gi'), '\n').replace(/\\([\\|])/g, '$1');
}

// width is already floored at 3, so every branch yields a valid GFM delimiter.
function delimiter_marker(
  align: 'left' | 'center' | 'right' | null,
  width: number,
): string {
  switch (align) {
    case 'left':
      return ':' + '-'.repeat(width - 1);
    case 'right':
      return '-'.repeat(width - 1) + ':';
    case 'center':
      return ':' + '-'.repeat(width - 2) + ':';
    default:
      return '-'.repeat(width);
  }
}

export function serialize_table(model: TableModel): string {
  const col_count = model.rows[0].length;

  // MC1: header row count wins — pad short rows, drop excess cells.
  const cells: string[][] = model.rows.map((row) =>
    Array.from({ length: col_count }, (_, c) => escape_cell_text(row[c] ?? '')),
  );

  // P3: column width is the widest cell, but at least 3 so the delimiter is valid.
  const widths: number[] = [];
  for (let c = 0; c < col_count; c++) {
    let w = 3;
    for (const row of cells) w = Math.max(w, byte_length(row[c]));
    widths[c] = w;
  }

  const align = (c: number): 'left' | 'center' | 'right' | null =>
    model.alignment[c] ?? null;

  // P3 pads on the side the column alignment dictates.
  const pad = (
    text: string,
    width: number,
    side: 'left' | 'center' | 'right' | null,
  ): string => {
    const gap = width - byte_length(text);
    if (side === 'right') return ' '.repeat(gap) + text;
    if (side === 'center') {
      const before = Math.floor(gap / 2);
      return ' '.repeat(before) + text + ' '.repeat(gap - before);
    }
    return text + ' '.repeat(gap);
  };

  const render_row = (row: string[]): string =>
    '| ' +
    row.map((cell, c) => pad(cell, widths[c], align(c))).join(' | ') +
    ' |';

  const lines: string[] = [];
  lines.push(render_row(cells[0]));
  lines.push(
    '| ' +
      widths
        .map((w, c) => pad(delimiter_marker(align(c), w), w, null))
        .join(' | ') +
      ' |',
  );
  for (let r = 1; r < cells.length; r++) lines.push(render_row(cells[r]));

  return lines.join('\n');
}
