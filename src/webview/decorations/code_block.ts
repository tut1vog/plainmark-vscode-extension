import { HighlightStyle } from '@codemirror/language';
import { type EditorState, type Range } from '@codemirror/state';
import { ranges_overlap } from '../ranges.js';
import { Decoration, EditorView } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { tags } from '@lezer/highlight';
import { make_inline_decorations_plugin, type NodeHandler } from './inline_decorations.js';
import { should_reveal_for_selection } from './selection_reveal.js';
import { syntax_token_classes, syntax_token_color } from './syntax_palette.js';

const fenced_body_deco = Decoration.line({ class: 'plainmark-fenced-code' });
const fenced_footer_deco = Decoration.line({
  class: 'plainmark-fenced-code plainmark-fenced-code-footer',
});
// Unclosed block — the last line is code content, not a closing fence, so it
// carries no reserved-fence band; it gets the padding-y the closing-fence line
// would otherwise have provided (parity with indented-code-last).
const fenced_content_end_deco = Decoration.line({
  class: 'plainmark-fenced-code plainmark-fenced-code-content-end',
});
// Zero-font mark, not a replace — a line-leading replace widget flickers
// drawSelection under lineWrapping (see headings.ts). The fence line
// keeps its full height (no line-height collapse) so reveal/hide reflows nothing.
const hide_fence = Decoration.mark({ class: 'plainmark-fenced-code-marker' });
const indented_body_deco = Decoration.line({ class: 'plainmark-indented-code' });
const indented_first_deco = Decoration.line({
  class: 'plainmark-indented-code plainmark-indented-code-first',
});
const indented_last_deco = Decoration.line({
  class: 'plainmark-indented-code plainmark-indented-code-last',
});

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

      const header_attrs: Record<string, string> = info
        ? { 'data-language': info }
        : {};

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
        class: 'plainmark-fenced-code plainmark-fenced-code-header',
        attributes: header_attrs,
      });

      for (let i = open_line.number; i <= end_line_no; i++) {
        const line = state.doc.line(i);
        let deco: Decoration;
        if (i === open_line.number) {
          deco = header_deco;
        } else if (i === close_line_no) {
          deco = fenced_footer_deco;
        } else if (i === end_line_no) {
          // Unclosed block — the last line is code content, not a fence.
          deco = fenced_content_end_deco;
        } else {
          deco = fenced_body_deco;
        }
        decorations.push(deco.range(line.from));
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

function indented_code_handler(): NodeHandler {
  return {
    nodeNames: ['CodeBlock'],
    handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
      const decorations: Range<Decoration>[] = [];
      const start_line_no = state.doc.lineAt(node.from).number;
      const end_line_no = state.doc.lineAt(node.to).number;
      for (let i = start_line_no; i <= end_line_no; i++) {
        const line = state.doc.line(i);
        let deco: Decoration;
        if (start_line_no === end_line_no) deco = indented_first_deco;
        else if (i === start_line_no) deco = indented_first_deco;
        else if (i === end_line_no) deco = indented_last_deco;
        else deco = indented_body_deco;
        decorations.push(deco.range(line.from));
      }
      return decorations;
    },
  };
}

export const code_block_handlers: readonly NodeHandler[] = [
  fenced_code_handler(),
  indented_code_handler(),
];

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
    '.plainmark-indented-code': shared_chrome,
    // Closed-block fence lines (header / footer) reserve a full line of height
    // even when collapsed, so that reserved line IS the top / bottom band — no
    // padding-y on top of it (option-a: no double spacing). The unclosed tail
    // and indented blocks have no reserved fence line, so they keep padding-y.
    '.plainmark-fenced-code-header': {
      position: 'relative',
    },
    '.plainmark-fenced-code-content-end': {
      'padding-bottom': padding_y,
    },
    '.plainmark-indented-code-first': {
      'padding-top': padding_y,
    },
    '.plainmark-indented-code-last': {
      'padding-bottom': padding_y,
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
  };

  // Syntax color rules scoped to code-block contexts only — the global highlight style
  // also tags markdown's own ListMark / CodeMark with tags.meta, which we leave uncolored.
  for (const t of syntax_token_classes) {
    rules[`.plainmark-fenced-code .plainmark-syntax-${t}, .plainmark-indented-code .plainmark-syntax-${t}`] = {
      color: syntax_token_color(t),
    };
  }

  return rules;
}

const code_block_theme = EditorView.theme(build_code_block_theme());

export const code_block_extension = [
  make_inline_decorations_plugin(code_block_handlers),
  code_block_theme,
];
