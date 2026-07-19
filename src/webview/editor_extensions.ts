import { autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab, redo } from '@codemirror/commands';
import { indentUnit, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { type Extension, Prec } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { search, searchKeymap } from '@codemirror/search';
import { oracle_line_height_pin } from './oracle_line_height_pin.js';
import { image_paste_extension } from './image_paste.js';
import {
  block_delimiter_autoclose,
  block_empty_backspace,
  fence_autopair_input,
} from './decorations/block_autoclose.js';
import { blockquote_extension } from './decorations/blockquote.js';
import {
  blockquote_empty_line_outdent,
  blockquote_plain_backspace,
} from './decorations/blockquote_keymap.js';
import { callout_theme } from './decorations/callout.js';
import { callout_completions } from './decorations/callout_autocomplete.js';
import { clipped_selection_layer } from './decorations/clipped_selection.js';
import {
  code_block_extension,
  plainmark_highlight_style,
} from './decorations/code_block.js';
import {
  codeblock_backspace,
  codeblock_tab_dedent,
  codeblock_tab_indent,
} from './decorations/codeblock_tab.js';
import { escapes_extension } from './decorations/escapes.js';
import {
  footnote_decorations_plugin,
  footnote_theme,
} from './decorations/footnote.js';
import { footnote_popover_extension } from './decorations/footnote_popover.js';
import { Footnote as footnote_grammar_extension } from './decorations/footnote_parser.js';
import { frontmatter_extension } from './decorations/frontmatter.js';
import { headings_extension } from './decorations/headings.js';
import { horizontal_rule_extension } from './decorations/horizontal_rule.js';
import { html_extension } from './decorations/html.js';
import { links_extension } from './decorations/links.js';
import {
  list_dangling_indent_backspace,
  list_empty_bullet_backspace,
} from './decorations/list_keymap.js';
import { lists_extension } from './decorations/lists.js';
import {
  lazy_continuation_backspace,
  marker_aware_backspace,
} from './decorations/marker_aware_backspace.js';
import { paragraph_gap_extension } from './decorations/paragraph_gap.js';
import { pointer_state_extension } from './decorations/pointer_state.js';
import { selection_wrap_extension } from './decorations/selection_wrap.js';
import { spacing_extension } from './decorations/spacing.js';
import { text_styles_extension } from './decorations/text_styles.js';
import { triple_click_select_line } from './decorations/triple_click_line.js';
import { frontmatter_extension as frontmatter_grammar_extension } from './grammar/frontmatter.js';
import { math_extension as math_grammar_extension } from './grammar/math.js';
import { image_extension } from './widgets/image.js';
import { accept_latex_completion_on_tab, latex_completions } from './widgets/latex_autocomplete.js';
import { math_extension } from './widgets/math.js';
import { math_click_select } from './widgets/math_click_select.js';
import { math_preview_extension } from './widgets/math_preview.js';
import { mermaid_extension } from './widgets/mermaid.js';
import { table_completions } from './widgets/table_autocomplete.js';
import { cell_subview_extensions, table_extension } from './widgets/table.js';
import { main_view_table_entry_keymap } from './widgets/table_keymap.js';
import { table_undo_rebase } from './widgets/table_undo_rebase.js';

// Shared editor extensions sans the table widget; the table widget references
// this list back via the cell_subview_extensions facet — same
// extensions inside the cell subview as in the main editor.
const editor_extensions_core: Extension[] = [
  history(),
  // 2-space indent unit keeps a Tab-indented prose line below the 4-space code-block threshold; fenced code overrides with 4. LIST-I-11 / CBLK-I-13.
  indentUnit.of('  '),
  // Required for deterministic caret rendering adjacent to block-replace widgets — native selection is browser-dependent inside such widgets per Marijn at discuss.codemirror.net/t/3239.
  drawSelection(),
  // Replaces drawSelection's selection rectangles with per-visual-row ones
  // computed from view.coordsAtPos in a single client-coordinate space (DPR-safe;
  // CM6's rectanglesForRange mixes scaled/unscaled coords and drifts at fractional
  // DPR). Stock selection backgrounds are suppressed via CSS below so the two
  // don't double-draw (drawSelection's caret is kept). See SHELL-X-9/X-10.
  clipped_selection_layer,
  // drawSelection() ships a Prec.highest rule re-enabling the opaque system
  // `Highlight` color for native ::selection inside any focused descendant of
  // .cm-content (`.cm-content :focus ::selection`). A cell subview is exactly
  // that, so its selection paints opaque over our translucent clipped layer
  // (the main view never triggers it — its content holds focus directly, not a
  // descendant). Re-hide it with a higher-specificity `!important` rule so the
  // clipped layer stays the only selection paint, matching outside-table cells.
  Prec.highest(
    EditorView.theme({
      '.cm-content .cm-content:focus, .cm-content .cm-content :focus': {
        '&::selection, & ::selection': {
          backgroundColor: 'transparent !important',
        },
      },
    }),
  ),
  EditorView.lineWrapping,
  // drawSelection hides the native caret (caret-color: transparent) and draws its own .cm-cursor with border-left: 1.2px solid black — invisible against VS Code dark theme. Bind the cursor and selection background to VS Code theme variables.
  EditorView.theme({
    // CM6 baseTheme draws a 1px dotted focus ring on .cm-editor; it overlaps the caret at column 0 in narrow panes and table cells. The webview is the editor, so the ring adds nothing.
    '&.cm-focused': {
      outline: 'none',
    },
    // Hard-set 16px / 1.5 body typography keystone — VS Code's
    // editor font-size underdelivers vs GitHub; downstream constructs inherit.
    // Body font-family → Primer system sans-serif stack for a
    // prose feel; code constructs keep --plainmark-font-code (monospace).
    // The prose-column constraint (max-width / centered margin / inset) is NOT
    // here — it lives in prose_column_theme so it stays off cell subviews.
    '.cm-content': {
      fontSize: 'var(--plainmark-font-size, 16px)',
      lineHeight: 'var(--plainmark-body-line-height, 1.5)',
      fontFamily:
        'var(--plainmark-font-text, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji")',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor:
        'var(--plainmark-cursor-color, var(--vscode-editorCursor-foreground, currentColor))',
    },
    // Selection background — translucent via color-mix so text underneath
    // shows through. Required because we elevate the selection layer above
    // .cm-content (see the .cm-selectionLayer rule below); with the layer
    // painted on top of chrome AND text, a fully-opaque
    // `--vscode-editor-selectionBackground` (e.g., Dark+ `#264F78` solid)
    // would obscure the selected text. 40% opacity preserves selection
    // visibility while letting text remain readable. The default fallback
    // already had alpha 0.3, so themes lacking the var only get marginally
    // more transparent. color-mix ships in Chromium 111+; VS Code bundles
    // 124+.
    '&.cm-focused > .cm-scroller > .cm-clippedSelectionLayer .cm-clippedSelectionBackground, .cm-clippedSelectionBackground, & ::selection':
      {
        background:
          'var(--plainmark-selection-background, color-mix(in srgb, var(--vscode-editor-selectionBackground, rgb(0, 102, 204)) 40%, transparent))',
      },
    // Suppress drawSelection's own full-width rectangles — clipped_selection_layer
    // draws the per-line text-clipped ones instead (cell subviews included, since
    // both layers live in editor_extensions_core). drawSelection's caret layer is
    // untouched. display:none from this app-tier theme beats the baseTheme color.
    '.cm-selectionLayer .cm-selectionBackground': {
      display: 'none',
    },
    // drawSelection() puts the selection rectangle in Layer.below — CM6 sets
    // `z-index: -2` INLINE on the layer via `Layer` API (verified by
    // tests/visual/drag-selection-visibility.spec.ts diagnostic dump). With
    // opaque background-image chrome on .cm-line (codeblock / frontmatter /
    // html / blockquote-bars), the chrome paints OVER the selection rectangle,
    // hiding it during click-drag. Callout escapes only because its bg tint
    // is `color-mix(... 10%, transparent)`. Inline styles beat CSS rules
    // without `!important`; the override here uses it pragmatically (CM6
    // doesn't expose a Layer.below z-index option). z-index: 0 puts the layer
    // above .cm-content's stacking position but well below the cursor layer
    // (z-index: 150) so the caret still paints over selection. Pair this with
    // the translucent selection bg rule above so the layer-elevation doesn't
    // obscure selected text.
    // pointer-events: none — CM6 sets this on .cm-cursorLayer but not on
    // .cm-selectionLayer (it relied on the layer sitting at z-index: -2 below
    // .cm-content). Once we elevate the layer to z-index: 0, the selection
    // rectangle starts intercepting clicks, so left-clicking on a selection
    // no longer reaches .cm-content's mousedown handler — the click can't
    // cancel/collapse the selection until the user clicks outside it. Pinning
    // pointer-events: none restores click pass-through without affecting
    // painting; the layer's children inherit unless they opt back in.
    '& > .cm-scroller > .cm-clippedSelectionLayer': {
      zIndex: '0 !important',
      pointerEvents: 'none',
    },
    // Double-caret defense: hide the main view's direct-child caret
    // when a cell subview is active. The `>` chain matches only the main
    // editor's own cursorLayer; subview carets sit deeper inside `.cm-content`
    // and are unaffected.
    '&[data-plainmark-cell-active] > .cm-scroller > .cm-cursorLayer > .cm-cursor':
      {
        display: 'none',
      },
  }),
  // Zero CM6's baseTheme .cm-line inset (0 2px 0 6px) via the baseTheme tier — construct themes (code / callout / list / blockquote / html / frontmatter) reliably override it, so only plain paragraphs / headings flush to x=0.
  EditorView.baseTheme({
    '.cm-line': {
      paddingLeft: '0',
      paddingRight: '0',
    },
  }),
  // historyKeymap binds Mod-Shift-z to redo on Mac (via mac override) and Linux (separate entry) but NOT Windows.
  keymap.of([
    ...defaultKeymap,
    ...historyKeymap,
    { key: 'Mod-Shift-z', run: redo, preventDefault: true },
    indentWithTab,
  ]),
  // Must run before markdownKeymap (auto-wired at Prec.high inside markdown()).
  Prec.highest(
    keymap.of([
      { key: 'Tab', run: accept_latex_completion_on_tab },
      { key: 'Tab', run: codeblock_tab_indent, shift: codeblock_tab_dedent },
      { key: 'Enter', run: blockquote_empty_line_outdent },
      { key: 'Enter', run: block_delimiter_autoclose },
      { key: 'Backspace', run: blockquote_plain_backspace },
      { key: 'Backspace', run: list_empty_bullet_backspace },
      { key: 'Backspace', run: list_dangling_indent_backspace },
      { key: 'Backspace', run: block_empty_backspace },
      { key: 'Backspace', run: codeblock_backspace },
      { key: 'Backspace', run: marker_aware_backspace },
      { key: 'Backspace', run: lazy_continuation_backspace },
    ]),
  ),
  selection_wrap_extension,
  EditorView.inputHandler.of(fence_autopair_input),
  // Pointer-down latch (mousedown → document mouseup). Gates marker
  // reveal in text_styles.ts / links.ts so a drag selection inside a
  // bold/italic/code/strikethrough/link construct doesn't flip the markers
  // from `display:none` to inline mid-drag (which would shift text width and
  // break the user's drag aim). Mouse-only — keyboard selection reveals
  // immediately.
  pointer_state_extension,
  // Triple-click line selection ends at line.to (no trailing newline), keeping
  // the caret at the line's end instead of CM6's default next-line-start.
  triple_click_select_line,
  // A plain single-click on a rendered math widget selects its inner LaTeX (sans
  // `$`/`$$`) so it is ready to copy; same mouseSelectionStyle hook as above.
  math_click_select,
  markdown({
    codeLanguages: languages,
    extensions: [GFM, math_grammar_extension, footnote_grammar_extension, frontmatter_grammar_extension],
  }),
  syntaxHighlighting(plainmark_highlight_style),
  image_extension,
  math_extension,
  math_preview_extension,
  mermaid_extension,
  text_styles_extension,
  escapes_extension,
  headings_extension,
  links_extension,
  lists_extension,
  blockquote_extension,
  callout_theme,
  code_block_extension,
  frontmatter_extension,
  html_extension,
  horizontal_rule_extension,
  footnote_decorations_plugin,
  footnote_theme,
  footnote_popover_extension,
  spacing_extension,
  paragraph_gap_extension,
];

// Prose-column constraint — constrain the contenteditable
// surface to a centered max-width column. The side inset is folded INTO
// max-width via calc, NOT applied as `.cm-content` padding: CM6's
// drawSelection() (rectanglesForRange in @codemirror/view) clamps open-ended
// selection rectangles — the full-width rows of a multi-line selection, the
// run-to-end-of-line edges — to `.cm-content`'s border-box offset by the first
// `.cm-line`'s padding; it never reads `.cm-content`'s own padding. A
// `padding-inline` here would let those rectangles overshoot the visible text
// column by the inset on each side. Folding the inset into max-width makes
// `.cm-content`'s border-box equal the text column, so selection rectangles
// land flush. `min(max-width, 100%)` keeps the breathing-room behavior (≥24px
// gap once the pane is narrower than max-width); net geometry is unchanged.
//
// Two guards keep this off table cell subviews — a cell subview is its own
// EditorView nested *inside* the main editor's `.cm-content`: (1) excluded from
// editor_extensions_core so the subview's `.cm-editor` never gets this theme
// class; (2) the `& > .cm-scroller > .cm-content` child chain — not a descendant
// selector — so the main editor's rule binds only to its own content, not to a
// nested subview's `.cm-content`. Either guard alone leaks the inset into
// cells and indents cell text.
const prose_column_theme: Extension = EditorView.theme({
  '& > .cm-scroller > .cm-content': {
    maxWidth:
      'calc(min(var(--plainmark-container-max-width, 1100px), 100%) - 2 * var(--plainmark-container-padding-inline, 24px))',
    marginInline: 'auto',
  },
});

// CM6's baseTheme hard-codes light-mode colors on the completion tooltip (#f5f5f5 panel, #17c selected row) and the webview's injected scrollbar rules follow the VS Code theme — route the shared popup (latex / callout / table sources) through --plainmark-* vars so themes reach it.
const autocomplete_theme: Extension = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor:
      'var(--plainmark-autocomplete-background, var(--plainmark-popover-background, var(--vscode-editorHoverWidget-background, var(--vscode-editor-background))))',
    border:
      '1px solid var(--plainmark-autocomplete-border-color, var(--plainmark-popover-border-color, var(--vscode-editorHoverWidget-border, currentColor)))',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor:
      'var(--plainmark-autocomplete-selected-background, var(--vscode-editorSuggestWidget-selectedBackground, rgba(0, 102, 204, 0.5)))',
    color:
      'var(--plainmark-autocomplete-selected-foreground, var(--vscode-editorSuggestWidget-selectedForeground, inherit))',
  },
  // VS Code webviews inject `html { scrollbar-color: … }`, which switches every scrollbar to the standard path where ::-webkit-scrollbar-* rules are ignored (Chrome 121+); the inherited property is re-overridden here at the element. Webkit rule kept below for environments without the injected html rule.
  '.cm-tooltip-autocomplete > ul': {
    scrollbarColor:
      'var(--plainmark-autocomplete-scrollbar-thumb-color, var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4))) transparent',
  },
  '.cm-tooltip-autocomplete > ul::-webkit-scrollbar-thumb': {
    backgroundColor:
      'var(--plainmark-autocomplete-scrollbar-thumb-color, var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4)))',
  },
});

// Find only — drop searchKeymap's multi-cursor / go-to-line bindings.
const find_keymap = searchKeymap.filter(
  (b) => !['Mod-d', 'Mod-Alt-g', 'Mod-Shift-l'].includes(b.key ?? ''),
);

// CM6's panel + search-match colors come from its light baseTheme (the
// darkTheme facet is unset), ignoring the VS Code theme — route through
// --vscode-* vars, mirroring autocomplete_theme.
const search_panel_theme: Extension = EditorView.theme({
  '.cm-panels': {
    backgroundColor:
      'var(--vscode-editorWidget-background, var(--vscode-editor-background, #ffffff))',
    color: 'var(--vscode-editorWidget-foreground, var(--vscode-foreground, inherit))',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom:
      '1px solid var(--vscode-editorWidget-border, var(--vscode-widget-border, transparent))',
  },
  '.cm-panel.cm-search .cm-textfield': {
    backgroundColor: 'var(--vscode-input-background, #ffffff)',
    color: 'var(--vscode-input-foreground, inherit)',
    border:
      '1px solid var(--vscode-input-border, var(--vscode-editorWidget-border, transparent))',
    borderRadius: '2px',
  },
  '.cm-panel.cm-search .cm-textfield:focus': {
    outline: '1px solid var(--vscode-focusBorder, #0090f1)',
    outlineOffset: '-1px',
  },
  '.cm-panel.cm-search .cm-button': {
    backgroundImage: 'none',
    backgroundColor:
      'var(--vscode-button-secondaryBackground, var(--vscode-button-background, #5f6a79))',
    color:
      'var(--vscode-button-secondaryForeground, var(--vscode-button-foreground, #ffffff))',
    border: '1px solid var(--vscode-button-border, transparent)',
    borderRadius: '2px',
  },
  '.cm-panel.cm-search .cm-button:hover': {
    backgroundColor:
      'var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground, #4c5561))',
  },
  '.cm-panel.cm-search [name="close"]': {
    color: 'var(--vscode-icon-foreground, var(--vscode-editorWidget-foreground, inherit))',
  },
  '.cm-searchMatch': {
    backgroundColor:
      'var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33))',
    outline: '1px solid var(--vscode-editor-findMatchHighlightBorder, transparent)',
  },
  '.cm-searchMatch-selected': {
    backgroundColor: 'var(--vscode-editor-findMatchBackground, rgba(81, 92, 106, 0.8))',
    outline: '1px solid var(--vscode-editor-findMatchBorder, transparent)',
  },
});

// Make .cm-scroller the scroll container (fill the height-bounded #editor host)
// rather than letting the page body scroll — CM6's scroll-stabilization measure
// loop only fires when it owns the scroller, so without this a fast scrollbar
// drag flashes the viewport back on release. Main view only: cell subviews build
// from editor_extensions_core and must keep their natural content height.
// Prec.lowest so an explicit `.cm-editor` height (a user stylesheet, or a test
// harness constraining height) overrides this baseline rather than colliding.
const scroller_theme: Extension = Prec.lowest(
  EditorView.theme({
    '&': { height: '100%' },
    // `scrollbar-gutter: stable` reserves the scrollbar's width whether or not it
    // is showing. Without it, a width-responsive block (mermaid SVG, wide table)
    // shrinks when the scrollbar appears, which can drop total height below the
    // overflow threshold, hide the scrollbar, regrow the content, and re-show it
    // — an oscillation that makes CM6's measure loop bail ("restarted more than
    // 5 times") and snaps the viewport on scroll.
    // VS Code webviews inject `html { scrollbar-color: … }` following the VS Code
    // theme, which the editor scrollbar inherits — leaving a VS Code-themed track
    // over a Plainmark-themed page. Re-override at the element: themed thumb, transparent
    // track so the page background shows through. Webkit rule kept for environments
    // without the injected html rule (same path as the autocomplete list, THEME-V-12).
    '.cm-scroller': {
      overflow: 'auto',
      scrollbarGutter: 'stable',
      scrollbarColor:
        'var(--plainmark-editor-scrollbar-thumb-color, var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4))) transparent',
    },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      backgroundColor:
        'var(--plainmark-editor-scrollbar-thumb-color, var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4)))',
    },
  }),
);

// Single source of truth for the production editor's extension list. The webview
// host and the Tier B visual harness both build on this so the suite renders the
// production editor; per-context extras (update listener, image-base dispatch) are
// appended by each caller.
export const editor_extensions: Extension[] = [
  ...editor_extensions_core,
  // Main view only (not in cell_subview_extensions) — the controller inserts at the
  // main caret, so a cell-subview paste must not be intercepted here.
  image_paste_extension,
  scroller_theme,
  // Main view only — cell subviews don't own a scroller, so they can't scroll-snap.
  oracle_line_height_pin,
  prose_column_theme,
  table_extension,
  table_undo_rebase,
  // Single autocompletion() call — CM6's completionConfig facet first-defined-wins on the `override` field, so a second autocompletion() would silently drop one source.
  autocompletion({ override: [table_completions, callout_completions, latex_completions] }),
  autocomplete_theme,
  // In-document find. Main view only — table cell subviews share no panel; a
  // cell's Ctrl+F bubbles to the main view's search, which scans the whole doc.
  search({ top: true }),
  // Prec.high so Ctrl+F opens search ahead of defaultKeymap's emacs Ctrl-f
  // (Mod-f resolves to Ctrl-f on Win/Linux) and its Escape (simplifySelection).
  Prec.high(keymap.of(find_keymap)),
  search_panel_theme,
  main_view_table_entry_keymap,
  cell_subview_extensions.of(editor_extensions_core),
];
