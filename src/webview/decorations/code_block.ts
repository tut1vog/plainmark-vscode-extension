import { HighlightStyle } from '@codemirror/language';
import { type EditorState, type Range } from '@codemirror/state';
import { ranges_overlap } from '../ranges.js';
import { Decoration, EditorView } from '@codemirror/view';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';
import { tags } from '@lezer/highlight';
import type { NodeHandler } from './inline_decorations.js';
import { should_reveal_for_selection } from './selection_reveal.js';
import { syntax_token_classes, syntax_token_color } from './syntax_palette.js';

const fenced_body_deco = Decoration.line({ class: 'plainmark-fenced-code' });
const fenced_footer_deco = Decoration.line({
  class: 'plainmark-fenced-code plainmark-fenced-code-footer',
});
// Unclosed block — the last line is code content, not a closing fence, so it
// carries no reserved-fence band; it gets the padding-y the closing-fence line
// would otherwise have provided.
const fenced_content_end_deco = Decoration.line({
  class: 'plainmark-fenced-code plainmark-fenced-code-content-end',
});
// Zero-font mark, not a replace — a line-leading replace widget flickers
// drawSelection under lineWrapping (see headings.ts). The fence line
// keeps its full height (no line-height collapse) so reveal/hide reflows nothing.
const hide_fence = Decoration.mark({ class: 'plainmark-fenced-code-marker' });
// Emitted in both caret states — a caret-state indent (raw spaces in flow)
// would shift the line on enter/leave, the defect the list never-reveal fixed.
const hide_indent = Decoration.mark({ class: 'plainmark-fenced-code-indent' });

// Quoted lines keep the status quo: the in-flow `> ` prefix and the quote's
// net-to-zero indent own their geometry, so nesting stops at any Blockquote.
function nest_context(node: SyntaxNode): { depth: number; quoted: boolean } {
  let depth = 0;
  for (let p = node.parent; p; p = p.parent) {
    if (p.name === 'Blockquote') return { depth: 0, quoted: true };
    if (p.name === 'ListItem') depth++;
  }
  return { depth, quoted: false };
}

// Per-depth line decorations are cached so equal depths share one instance.
const nested_lines = new Map<string, Decoration>();
function nested_line(base_class: string, depth: number): Decoration {
  const key = `${base_class}|${depth}`;
  let deco = nested_lines.get(key);
  if (!deco) {
    deco = Decoration.line({
      class: `${base_class} plainmark-fenced-code-nested`,
      attributes: { style: `--plainmark-list-depth: ${depth}` },
    });
    nested_lines.set(key, deco);
  }
  return deco;
}

function fenced_code_handler(): NodeHandler {
  return {
    nodeNames: ['FencedCode'],
    handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
      const decorations: Range<Decoration>[] = [];
      const open_line = state.doc.lineAt(node.from);
      const end_line_no = state.doc.lineAt(node.to).number;

      // Raw user bytes preserved verbatim (never canonicalized).
      let info = '';
      const info_node = node.node.getChild('CodeInfo');
      if (info_node) info = state.doc.sliceString(info_node.from, info_node.to).trim();

      // Mermaid fences render via the block widget — cede here unless the caret is inside the block.
      if (info.toLowerCase() === 'mermaid') {
        const sel = state.selection.main;
        if (!ranges_overlap(sel, node)) return [];
      }

      const { depth, quoted } = nest_context(node.node);
      const nested = depth > 0;

      const header_attrs: Record<string, string> = info
        ? { 'data-language': info }
        : {};
      if (nested) header_attrs['style'] = `--plainmark-list-depth: ${depth}`;

      // Typora-style fence reveal at whole-node granularity: the opening and
      // closing fence text is hidden (zero-font mark over a full-height line)
      // unless the caret/selection touches the block (MRS-R-4 non-strict-cover
      // rule, so select-all keeps fences hidden but selecting a fence reveals it).
      const marks = node.node.getChildren('CodeMark');
      const close_mark = marks.length > 1 ? marks[marks.length - 1] : null;
      const close_line_no = close_mark
        ? state.doc.lineAt(close_mark.from).number
        : -1;
      const revealed = should_reveal_for_selection(state, node.from, node.to);

      const header_deco = Decoration.line({
        class: nested
          ? 'plainmark-fenced-code plainmark-fenced-code-header plainmark-fenced-code-nested'
          : 'plainmark-fenced-code plainmark-fenced-code-header',
        attributes: header_attrs,
      });

      // CommonMark strips the fence's indent from the block's content, so up
      // to that many leading whitespace characters per line are display-hidden.
      const fence_indent =
        !quoted && marks.length > 0 ? marks[0].from - open_line.from : 0;

      for (let i = open_line.number; i <= end_line_no; i++) {
        const line = state.doc.line(i);
        let deco: Decoration;
        if (i === open_line.number) {
          deco = header_deco;
        } else if (i === close_line_no) {
          deco = nested
            ? nested_line('plainmark-fenced-code plainmark-fenced-code-footer', depth)
            : fenced_footer_deco;
        } else if (i === end_line_no) {
          // Unclosed block — the last line is code content, not a fence.
          deco = nested
            ? nested_line('plainmark-fenced-code plainmark-fenced-code-content-end', depth)
            : fenced_content_end_deco;
        } else {
          deco = nested ? nested_line('plainmark-fenced-code', depth) : fenced_body_deco;
        }
        decorations.push(deco.range(line.from));
        if (fence_indent > 0) {
          let ws = 0;
          while (
            ws < fence_indent &&
            ws < line.text.length &&
            (line.text[ws] === ' ' || line.text[ws] === '\t')
          )
            ws++;
          if (ws > 0) decorations.push(hide_indent.range(line.from, line.from + ws));
        }
      }

      if (!revealed) {
        if (open_line.from < open_line.to) {
          decorations.push(hide_fence.range(open_line.from, open_line.to));
        }
        if (close_mark) {
          const close_line = state.doc.lineAt(close_mark.from);
          if (close_line.from < close_line.to) {
            decorations.push(hide_fence.range(close_line.from, close_line.to));
          }
        }
      }
      return decorations;
    },
  };
}

export const code_block_handlers: readonly NodeHandler[] = [fenced_code_handler()];

export const plainmark_highlight_style = HighlightStyle.define([
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.modifier,
      tags.operatorKeyword,
      tags.definitionKeyword,
    ],
    class: 'plainmark-syntax-keyword',
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    class: 'plainmark-syntax-comment',
  },
  {
    tag: [
      tags.string,
      tags.character,
      tags.regexp,
      tags.escape,
      tags.special(tags.string),
    ],
    class: 'plainmark-syntax-string',
  },
  {
    tag: [tags.number, tags.integer, tags.float, tags.atom],
    class: 'plainmark-syntax-number',
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    class: 'plainmark-syntax-function',
  },
  {
    tag: [
      tags.variableName,
      tags.definition(tags.variableName),
      tags.local(tags.variableName),
    ],
    class: 'plainmark-syntax-variable',
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    class: 'plainmark-syntax-type',
  },
  {
    tag: [tags.propertyName, tags.attributeName, tags.labelName],
    class: 'plainmark-syntax-property',
  },
  {
    tag: [tags.tagName, tags.angleBracket],
    class: 'plainmark-syntax-tag',
  },
  {
    tag: [tags.meta, tags.processingInstruction, tags.documentMeta],
    class: 'plainmark-syntax-meta',
  },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator],
    class: 'plainmark-syntax-punctuation',
  },
  {
    tag: [tags.invalid, tags.deleted],
    class: 'plainmark-syntax-invalid',
  },
]);

function build_code_block_theme(): Record<string, Record<string, string>> {
  const padding_x = 'var(--plainmark-fenced-code-padding-x, 1em)';
  const padding_y = 'var(--plainmark-fenced-code-padding-y, 0.5em)';
  const margin_x = 'var(--plainmark-fenced-code-margin-x, 0px)';
  const line_height = 'var(--plainmark-fenced-code-line-height, 1.45)';
  const size = 'var(--plainmark-fenced-code-size, 1em)';
  const label_color =
    'var(--plainmark-fenced-code-language-label-color, var(--vscode-descriptionForeground, currentColor))';
  const label_size = 'var(--plainmark-fenced-code-language-label-size, 0.75em)';

  // One indent unit per enclosing list level — the same step the list lines use.
  const nest =
    'calc(var(--plainmark-list-depth, 0) * var(--plainmark-list-indent, 1em))';

  const background =
    'var(--plainmark-code-background, var(--vscode-textCodeBlock-background, var(--vscode-textPreformat-background, transparent)))';
  const color =
    'var(--plainmark-code-color, var(--vscode-foreground, inherit))';
  const font_family = 'var(--plainmark-font-code, monospace)';

  // Background-image gradient (not margin) because margin on .cm-line desyncs CM6's height map.
  const bg_grad = `linear-gradient(${background}, ${background})`;
  const bg_size = `calc(100% - ${margin_x}) 100%`;
  const bg_pos = `${margin_x} 0`;
  const shared_chrome: Record<string, string> = {
    'background-image': bg_grad,
    'background-size': bg_size,
    'background-position': bg_pos,
    'background-repeat': 'no-repeat',
    color,
    'font-family': font_family,
    'font-size': size,
    'line-height': line_height,
    'padding-left': `calc(${margin_x} + ${padding_x})`,
    'padding-right': padding_x,
  };

  const rules: Record<string, Record<string, string>> = {
    '.plainmark-fenced-code': shared_chrome,
    // Closed-block fence lines (header / footer) reserve a full line of height
    // even when collapsed, so that reserved line IS the top / bottom band — no
    // padding-y on top of it (option-a: no double spacing). The unclosed tail
    // has no reserved fence line, so it keeps padding-y.
    '.plainmark-fenced-code-header': {
      position: 'relative',
    },
    '.plainmark-fenced-code-content-end': {
      'padding-bottom': padding_y,
    },
    // PARA-R-7: the opening fence line carries the paragraph gap above the
    // block (padding-top from the tripled paragraph-gap rule — the header has
    // no competing padding). The code background bottom-anchors and stops
    // short of the gap so it renders as clear space; the reserved fence line
    // stays the block's tinted top band below it. Only a fence's FIRST line
    // can carry the gap class (interior lines are ineligible), so no extra
    // marker class is needed.
    '.plainmark-fenced-code-header.plainmark-paragraph-gap': {
      'background-size': `calc(100% - ${margin_x}) calc(100% - var(--plainmark-paragraph-gap, 0.75em))`,
      'background-position': `${margin_x} bottom`,
    },
    // The language label pins to the top of the TINTED band, not the padded box.
    '.plainmark-fenced-code-header.plainmark-paragraph-gap::before': {
      top: 'calc(0.25em + var(--plainmark-paragraph-gap, 0.75em))',
    },
    '.plainmark-fenced-code-header::before': {
      content: 'attr(data-language)',
      position: 'absolute',
      top: '0.25em',
      right: '0.75em',
      // Pin the label's own line box so it sits cleanly in the reserved header
      // line regardless of the fence line's line-height.
      'line-height': '1',
      color: label_color,
      'font-size': label_size,
      'font-family': font_family,
      'pointer-events': 'none',
      'user-select': 'none',
    },
    // Fence text hidden by zero font-size on the glyphs only. The line keeps its
    // full line-height strut, so the collapsed fence reserves a full line of
    // space and revealing it reflows nothing.
    '.plainmark-fenced-code-marker': {
      'font-size': '0',
    },
    // List-nested block: the tinted box and its padding shift right to the
    // list content column (depth indent units past the margin). Declared after
    // the shared chrome so the padding-left override wins the specificity tie.
    '.plainmark-fenced-code-nested': {
      'background-size': `calc(100% - ${margin_x} - ${nest}) 100%`,
      'background-position': `calc(${margin_x} + ${nest}) 0`,
      'padding-left': `calc(${margin_x} + ${padding_x} + ${nest})`,
    },
    // Triple-class form so the nest offset beats the two-class gapped-header
    // background rule above.
    '.plainmark-fenced-code-nested.plainmark-fenced-code-header.plainmark-paragraph-gap': {
      'background-size': `calc(100% - ${margin_x} - ${nest}) calc(100% - var(--plainmark-paragraph-gap, 0.75em))`,
      'background-position': `calc(${margin_x} + ${nest}) bottom`,
    },
    '.plainmark-fenced-code-indent': {
      'font-size': '0',
    },
  };

  // Syntax color rules scoped to code-block contexts only — the global highlight style
  // also tags markdown's own ListMark / CodeMark with tags.meta, which we leave uncolored.
  for (const t of syntax_token_classes) {
    rules[`.plainmark-fenced-code .plainmark-syntax-${t}`] = {
      color: syntax_token_color(t),
    };
  }

  return rules;
}

const code_block_theme = EditorView.theme(build_code_block_theme());

export const code_block_extension = [code_block_theme];
