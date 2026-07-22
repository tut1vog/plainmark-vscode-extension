import { type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { make_inline_decorations_plugin, type NodeHandler } from './inline_decorations.js';
import { syntax_token_color } from './syntax_palette.js';

const html_block_deco = Decoration.line({ class: 'plainmark-html-block' });
const html_inline_deco = Decoration.mark({ class: 'plainmark-html-inline' });

function html_block_handler(): NodeHandler {
  return {
    nodeNames: ['HTMLBlock', 'CommentBlock', 'ProcessingInstructionBlock'],
    handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
      const decorations: Range<Decoration>[] = [];
      const start_line_no = state.doc.lineAt(node.from).number;
      const end_line_no = state.doc.lineAt(node.to).number;
      for (let i = start_line_no; i <= end_line_no; i++) {
        const line = state.doc.line(i);
        decorations.push(html_block_deco.range(line.from));
      }
      return decorations;
    },
  };
}

function html_inline_handler(): NodeHandler {
  return {
    nodeNames: ['HTMLTag', 'Comment', 'ProcessingInstruction'],
    handle(node: SyntaxNodeRef): Range<Decoration>[] {
      if (node.from === node.to) return [];
      return [html_inline_deco.range(node.from, node.to)];
    },
  };
}

export const html_handlers: readonly NodeHandler[] = [
  html_block_handler(),
  html_inline_handler(),
];

function build_html_theme(): Record<string, Record<string, string>> {
  const padding_x = 'var(--plainmark-html-padding-x, var(--plainmark-fenced-code-padding-x, 1em))';
  const margin_x = 'var(--plainmark-html-margin-x, var(--plainmark-fenced-code-margin-x, 0px))';
  const line_height =
    'var(--plainmark-html-line-height, var(--plainmark-fenced-code-line-height, 1.5))';
  const size = 'var(--plainmark-html-size, var(--plainmark-fenced-code-size, 0.9em))';

  const background =
    'var(--plainmark-html-background, var(--plainmark-code-background, var(--vscode-textCodeBlock-background, var(--vscode-textPreformat-background, transparent))))';
  const color =
    'var(--plainmark-html-color, var(--plainmark-code-color, var(--vscode-foreground, inherit)))';
  const font_family = 'var(--plainmark-font-code, monospace)';

  // Background-image gradient (not margin) — margin on .cm-line desyncs CM6's height map.
  const bg_grad = `linear-gradient(${background}, ${background})`;
  const bg_size = `calc(100% - ${margin_x}) 100%`;
  const bg_pos = `${margin_x} 0`;

  const inline_color =
    'var(--plainmark-html-inline-color, var(--plainmark-html-color, var(--plainmark-code-color, inherit)))';
  const inline_font =
    'var(--plainmark-html-inline-font-family, var(--plainmark-font-code, monospace))';
  const inline_size = 'var(--plainmark-html-inline-size, var(--plainmark-html-size, 0.9em))';

  const rules: Record<string, Record<string, string>> = {
    '.plainmark-html-block': {
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
    },
    '.plainmark-html-inline': {
      color: inline_color,
      'font-family': inline_font,
      'font-size': inline_size,
    },
    // PARA-R-7: an HTML block's first line carries the paragraph gap above the
    // block (padding-top from the tripled paragraph-gap rule; no competing
    // padding here). The background bottom-anchors and stops short of the gap
    // so it renders as clear space. Only the block's FIRST line can carry the
    // gap class (interior lines are ineligible), so no marker class is needed.
    '.plainmark-html-block.plainmark-paragraph-gap': {
      'background-size': `calc(100% - ${margin_x}) calc(100% - var(--plainmark-paragraph-gap, 0.75em))`,
      'background-position': `${margin_x} bottom`,
    },
  };

  // Syntax-token color rules scoped under HTML chrome contexts — mirrors the
  // .plainmark-fenced-code / .plainmark-frontmatter-* idiom. Only the
  // groups that lang-html's styleTags can emit (tag / property / string /
  // comment / meta / punctuation) get scoped rules; the others remain inert
  // here because lang-html never tags them.
  const token_classes = ['tag', 'property', 'string', 'comment', 'meta', 'punctuation'] as const;
  for (const t of token_classes) {
    rules[`.plainmark-html-block .plainmark-syntax-${t}, .plainmark-html-inline .plainmark-syntax-${t}`] = {
      color: syntax_token_color(t),
    };
  }

  return rules;
}

const html_theme = EditorView.theme(build_html_theme());

export const html_extension = [
  make_inline_decorations_plugin(html_handlers),
  html_theme,
];
