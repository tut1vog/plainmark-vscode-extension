import { type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { make_inline_decorations_plugin, type NodeHandler } from './inline_decorations.js';
import { should_reveal_for_selection } from './selection_reveal.js';
import { syntax_token_classes, syntax_token_color } from './syntax_palette.js';

const body_deco = Decoration.line({ class: 'plainmark-frontmatter' });
const footer_deco = Decoration.line({ class: 'plainmark-frontmatter-footer' });
const header_deco = Decoration.line({
  class: 'plainmark-frontmatter-header',
  attributes: { 'data-language': 'yaml' },
});
// Zero-font mark (not a replace) so the hidden `---` line keeps full height —
// reveal/hide reflows nothing. Same idiom as code_block.ts's fence hide.
const hide_marker = Decoration.mark({ class: 'plainmark-frontmatter-marker' });

function frontmatter_handler(): NodeHandler {
  return {
    nodeNames: ['FrontMatter'],
    handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
      const decorations: Range<Decoration>[] = [];
      const start_line_no = state.doc.lineAt(node.from).number;
      const end_line_no = state.doc.lineAt(node.to).number;
      for (let i = start_line_no; i <= end_line_no; i++) {
        const line = state.doc.line(i);
        let deco: Decoration;
        if (i === start_line_no) deco = header_deco;
        else if (i === end_line_no) deco = footer_deco;
        else deco = body_deco;
        decorations.push(deco.range(line.from));
      }

      // Typora-style fence reveal, identical to fenced code (CBLK-I-1/I-2): hide the
      // opening and closing `---` lines together unless the caret/selection touches
      // the block (MRS non-strict-cover predicate + pointer-down freeze).
      if (!should_reveal_for_selection(state, node.from, node.to)) {
        const open_line = state.doc.line(start_line_no);
        if (open_line.from < open_line.to) {
          decorations.push(hide_marker.range(open_line.from, open_line.to));
        }
        const close_line = state.doc.line(end_line_no);
        if (close_line.from < close_line.to) {
          decorations.push(hide_marker.range(close_line.from, close_line.to));
        }
      }
      return decorations;
    },
  };
}

export const frontmatter_handlers: readonly NodeHandler[] = [frontmatter_handler()];

function build_frontmatter_theme(): Record<string, Record<string, string>> {
  const padding_x = 'var(--plainmark-frontmatter-padding-x, 1em)';
  const margin_x = 'var(--plainmark-frontmatter-margin-x, 0px)';
  const line_height = 'var(--plainmark-frontmatter-line-height, 1.5)';
  const size = 'var(--plainmark-frontmatter-size, 0.9em)';
  const label_color =
    'var(--plainmark-frontmatter-language-label-color, var(--vscode-descriptionForeground, currentColor))';
  const label_size = 'var(--plainmark-frontmatter-language-label-size, 0.75em)';

  const background =
    'var(--plainmark-frontmatter-background, var(--plainmark-code-background, var(--vscode-textCodeBlock-background, var(--vscode-textPreformat-background, transparent))))';
  const color =
    'var(--plainmark-frontmatter-color, var(--plainmark-code-color, var(--vscode-foreground, inherit)))';
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
    // Hidden full-height `---` line is the top/bottom band — no padding-y on top of it (CBLK-R-5).
    '.plainmark-frontmatter-header': { ...shared_chrome, position: 'relative' },
    '.plainmark-frontmatter': shared_chrome,
    '.plainmark-frontmatter-footer': shared_chrome,
    '.plainmark-frontmatter-header::before': {
      content: 'attr(data-language)',
      position: 'absolute',
      top: '0.25em',
      right: '0.75em',
      // Pin the label box to the reserved header line regardless of line-height.
      'line-height': '1',
      color: label_color,
      'font-size': label_size,
      'font-family': font_family,
      'pointer-events': 'none',
      'user-select': 'none',
    },
    // Hide fence glyphs; the line keeps its strut (see hide_marker).
    '.plainmark-frontmatter-marker': {
      'font-size': '0',
    },
  };

  // Syntax-token color rules scoped under frontmatter line classes — same idiom as
  // .plainmark-fenced-code.
  for (const t of syntax_token_classes) {
    rules[
      `.plainmark-frontmatter-header .plainmark-syntax-${t}, .plainmark-frontmatter .plainmark-syntax-${t}, .plainmark-frontmatter-footer .plainmark-syntax-${t}`
    ] = {
      color: syntax_token_color(t),
    };
  }

  return rules;
}

const frontmatter_theme = EditorView.theme(build_frontmatter_theme());

export const frontmatter_extension = [
  make_inline_decorations_plugin(frontmatter_handlers),
  frontmatter_theme,
];
