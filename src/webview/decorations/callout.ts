import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import {
  hanging_indent_px,
  hide_marker,
  marker_metrics_field,
  quote_prefix_counts,
} from './blockquote.js';
import {
  type CalloutInfo,
  type CalloutType,
  synthesize_title,
} from './callout_detect.js';
import { ICON_SVG_BY_TYPE } from './callout_icons.js';
import { line_revealed } from './quote_reveal.js';

class CalloutTitleWidget extends WidgetType {
  constructor(readonly info: CalloutInfo) {
    super();
  }

  eq(other: CalloutTitleWidget): boolean {
    return (
      other.info.type === this.info.type &&
      other.info.title === this.info.title &&
      other.info.fold === this.info.fold &&
      other.info.raw_type === this.info.raw_type
    );
  }

  toDOM(): HTMLElement {
    const root = document.createElement('span');
    root.className = 'plainmark-callout-title';

    const icon = document.createElement('span');
    icon.className = 'plainmark-callout-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = ICON_SVG_BY_TYPE[this.info.type] ?? ICON_SVG_BY_TYPE.unknown;
    root.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'plainmark-callout-title-text';
    label.textContent = synthesize_title(this.info);
    root.appendChild(label);

    if (this.info.fold !== null) {
      const chev = document.createElement('span');
      chev.className = 'plainmark-callout-fold-marker';
      chev.setAttribute('aria-hidden', 'true');
      chev.setAttribute('title', 'Collapsibility coming in a later release');
      chev.textContent = this.info.fold === '-' ? '▸' : '▾';
      root.appendChild(chev);
    }
    return root;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

export function build_callout_decorations(
  state: EditorState,
  node: SyntaxNodeRef,
  info: CalloutInfo,
): Range<Decoration>[] {
  const decorations: Range<Decoration>[] = [];

  const start_line_no = state.doc.lineAt(node.from).number;
  const end_line_no = state.doc.lineAt(node.to).number;
  const header_label = synthesize_title(info);

  // Per-line measured hanging indent (CALL-R-10 / BQ-R-12): a callout is always
  // depth 1 (CALL-E-6), so each line's indent is one marker advance plus that
  // line's own leading content whitespace — wrapped body rows then hang under the
  // first visible glyph (matching Obsidian / the native preview), and the body-x
  // matches a depth-1 quote's. Inline so it outranks the theme's `text_gap`
  // pre-measure fallback.
  const metrics = state.field(marker_metrics_field, false) ?? { gt: 0, space: 0 };
  const indent_style = (line_text: string): string | undefined => {
    if (metrics.gt <= 0) return undefined;
    const counts = quote_prefix_counts(line_text);
    const px = hanging_indent_px(counts.gt, counts.ws, metrics);
    return `padding-left:${px}px;text-indent:-${px}px`;
  };

  // Outer bottom padding lives on the last line so it mirrors the header's
  // top padding — keeps the callout box vertically symmetric like a blockquote.
  const last_line_deco = Decoration.line({ class: 'plainmark-callout-last' });

  const header_line = state.doc.line(start_line_no);
  const header_revealed = line_revealed(state, header_line.from, header_line.to);

  for (let i = start_line_no; i <= end_line_no; i++) {
    const line = state.doc.line(i);
    const style = indent_style(line.text);
    // aria-label on Decoration.line (vs aria-labelledby + per-toDOM id) — the line element is rebuilt independently of the widget; carrying a static label string is simpler than threading an id between two passes.
    const deco =
      i === start_line_no
        ? Decoration.line({
            class: 'plainmark-callout plainmark-callout-header',
            attributes: {
              'data-callout-type': info.type,
              'data-callout-fold': info.fold ?? '',
              role: 'note',
              'aria-label': header_label,
              ...(style ? { style } : {}),
            },
          })
        : Decoration.line({
            class: 'plainmark-callout plainmark-callout-body',
            attributes: {
              'data-callout-type': info.type,
              ...(style ? { style } : {}),
            },
          });
    decorations.push(deco.range(line.from));
    if (i === end_line_no) decorations.push(last_line_deco.range(line.from));
  }

  // Per-line reveal: the title widget is dropped only when the caret is on
  // the header line, where the raw `> [!TYPE] title` bytes show for editing.
  // Caret on a body line or outside the callout keeps the widget rendered. A
  // top-of-doc callout with the caret at offset 0 on mount shows raw header
  // source (accepted; CALL-I-1).
  if (!header_revealed) {
    decorations.push(
      Decoration.replace({ widget: new CalloutTitleWidget(info) }).range(
        info.marker_from,
        info.marker_to,
      ),
    );
  }

  // Per-line `>` hide: skip the active line so its marker shows as editable
  // text (inherited BQ-R-2).
  const quote_marks: { from: number; to: number }[] = [];
  syntaxTree(state).iterate({
    from: node.from,
    to: node.to,
    enter(child) {
      if (child.name === 'QuoteMark') {
        const line = state.doc.lineAt(child.from);
        if (line_revealed(state, line.from, line.to)) return;
        const after = child.to;
        const has_trailing_space =
          after < state.doc.length && state.doc.sliceString(after, after + 1) === ' ';
        const hide_to = has_trailing_space ? after + 1 : after;
        quote_marks.push({ from: child.from, to: hide_to });
      }
    },
  });
  quote_marks.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const qm of quote_marks) {
    decorations.push(hide_marker.range(qm.from, qm.to));
  }

  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return decorations;
}

function build_callout_theme(): Record<string, Record<string, string>> {
  const padding_x = 'var(--plainmark-callout-padding-x, 1em)';
  const padding_y = 'var(--plainmark-callout-padding-y, 0.5em)';
  const margin_x = 'var(--plainmark-callout-margin-x, 0px)';
  const title_weight = 'var(--plainmark-callout-title-weight, 500)';
  const title_size = 'var(--plainmark-callout-title-size, 1em)';
  const title_padding_bottom =
    'var(--plainmark-callout-title-padding-bottom, 0.25em)';
  const border_width = 'var(--plainmark-callout-border-width, 4px)';
  // Content hugs the accent bar by the same small gap a blockquote uses, so
  // callout and blockquote text align on the same x; defaults to the blockquote
  // gap but stays independently themable.
  const text_gap =
    'var(--plainmark-callout-text-gap, var(--plainmark-blockquote-text-gap, 0.5em))';

  // Total left padding on the .cm-line: outer gap + text gap (bar overlaps the
  // gap, drawn via background-image gradient at offset `margin_x`, not
  // border-left, so it can be inset from the editor edge — same pattern as
  // the blockquote multi-bar). Margin on .cm-line is forbidden per the
  // height-map rule, so gap lives inside padding-left.
  const total_pad_left = `calc(${margin_x} + ${text_gap})`;

  // Hanging indent nets content to body-x: text-indent cancels the full
  // padding-left so each callout line's first line starts at the editor's
  // content-left — where CM6 drawSelection derives its single leftSide — so the
  // selection highlight aligns with the text (SHELL-X-9). The accent bar sits at
  // margin_x over the hidden `>` marker slot, so the title widget / body text
  // still clear it. Horizontal-only.
  const rules: Record<string, Record<string, string>> = {
    '.plainmark-callout': {
      'padding-left': total_pad_left,
      'text-indent': `calc(-1 * (${margin_x} + ${text_gap}))`,
      'padding-right': padding_x,
    },
    '.plainmark-callout-header': {
      'padding-top': padding_y,
      'padding-bottom': title_padding_bottom,
      'font-weight': title_weight as 'bold',
      'font-size': title_size,
    },
    '.plainmark-callout-body': {
      'padding-top': '0',
      'padding-bottom': '0',
    },
    // Single-class selector, declared after -header / -body so source order
    // wins the specificity tie and the outer bottom padding is restored.
    '.plainmark-callout-last': {
      'padding-bottom': padding_y,
    },
    // DIRECT-child text-indent reset: Chromium leaks the line's negative indent into the inline-flex title, collapsing its icon/label gap (Firefox#1682380); a descendant `*` reset would also kill the body's first-line hang.
    '.plainmark-callout > *': {
      'text-indent': '0',
    },
    '.plainmark-callout-title': {
      display: 'inline-flex',
      'align-items': 'center',
      gap: '0.5em',
    },
    '.plainmark-callout-icon': {
      display: 'inline-flex',
      'align-items': 'center',
    },
    '.plainmark-callout-fold-marker': {
      'margin-left': '0.25em',
      opacity: '0.6',
    },
  };

  const chart_color_by_type: Record<CalloutType, string> = {
    note: 'var(--vscode-charts-blue, #4dafff)',
    tip: 'var(--vscode-charts-green, #89d185)',
    important: 'var(--vscode-charts-purple, #b180d7)',
    warning: 'var(--vscode-charts-yellow, #cca700)',
    caution: 'var(--vscode-charts-red, #f48771)',
    unknown: 'var(--vscode-descriptionForeground, currentColor)',
  };

  for (const type of [
    'note',
    'tip',
    'important',
    'warning',
    'caution',
    'unknown',
  ] as const) {
    const color_var = `var(--plainmark-callout-${type}-color, ${chart_color_by_type[type]})`;
    const border_color = `var(--plainmark-callout-${type}-border-color, ${color_var})`;
    const bg = `var(--plainmark-callout-${type}-background, color-mix(in srgb, ${color_var} 10%, transparent))`;
    const title_color = `var(--plainmark-callout-${type}-title-color, ${color_var})`;

    // Two stacked linear-gradient layers: bar at `margin_x`, bg tint covering
    // everything from `margin_x` to the right edge. Layered order: bar over bg.
    const bar_grad = `linear-gradient(${border_color}, ${border_color})`;
    const bg_grad = `linear-gradient(${bg}, ${bg})`;
    const bar_size = `${border_width} 100%`;
    const bg_size = `calc(100% - ${margin_x}) 100%`;
    const bar_pos = `${margin_x} 0`;
    const bg_pos = `${margin_x} 0`;
    const chrome = {
      'background-image': `${bar_grad}, ${bg_grad}`,
      'background-size': `${bar_size}, ${bg_size}`,
      'background-position': `${bar_pos}, ${bg_pos}`,
      'background-repeat': 'no-repeat',
    };

    rules[`.plainmark-callout-header[data-callout-type="${type}"]`] = {
      color: title_color,
      ...chrome,
    };
    rules[`.plainmark-callout-body[data-callout-type="${type}"]`] = chrome;
  }

  return rules;
}

export const callout_theme = EditorView.theme(build_callout_theme());
