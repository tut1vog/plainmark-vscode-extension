import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range, RangeSet } from '@codemirror/state';
import { ranges_overlap } from '../ranges.js';
import { closed_math_fence_regions } from './dissolved_math.js';
import {
  type Decoration,
  type DecorationSet,
  type EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { pointer_down_field } from './pointer_state.js';

export interface NodeHandler {
  readonly nodeNames: readonly string[];
  handle(node: SyntaxNodeRef, state: EditorState, revealed: boolean): Range<Decoration>[];
}

export type HandlerRegistry = Map<string, NodeHandler[]>;

export interface RevealRange {
  from: number;
  to: number;
}

export function build_registry(handlers: readonly NodeHandler[]): HandlerRegistry {
  const registry: HandlerRegistry = new Map();
  for (const handler of handlers) {
    for (const name of handler.nodeNames) {
      const list = registry.get(name);
      if (list) list.push(handler);
      else registry.set(name, [handler]);
    }
  }
  return registry;
}

export function compute_reveal_ranges(state: EditorState): RevealRange[] {
  const ranges: RevealRange[] = [];
  for (const range of state.selection.ranges) {
    const start_line = state.doc.lineAt(range.from);
    const end_line = state.doc.lineAt(range.to);
    ranges.push({ from: start_line.from, to: end_line.to });
  }
  return ranges;
}

export function build_inline_decorations(
  state: EditorState,
  visible_ranges: readonly { readonly from: number; readonly to: number }[],
  registry: HandlerRegistry,
): DecorationSet {
  const reveal_ranges = compute_reveal_ranges(state);
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);
  // Math source dissolved into paragraphs (MATH-E-12) must display
  // byte-accurate — no marker hiding or inline styling inside a `$$` pair.
  const suppress_ranges = closed_math_fence_regions(state);

  for (const { from, to } of visible_ranges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        const handlers = registry.get(node.name);
        if (!handlers) return;
        if (suppress_ranges.some((r) => ranges_overlap(node, r))) return;
        const revealed = reveal_ranges.some((r) => ranges_overlap(node, r));
        for (const handler of handlers) {
          for (const deco of handler.handle(node, state, revealed)) {
            decorations.push(deco);
          }
        }
      },
    });
  }

  return RangeSet.of(decorations, true);
}

class InlineDecorationsPlugin implements PluginValue {
  decorations: DecorationSet;
  private readonly registry: HandlerRegistry;
  private readonly extra_rebuild?: (update: ViewUpdate) => boolean;

  constructor(
    view: EditorView,
    handlers: readonly NodeHandler[],
    extra_rebuild?: (update: ViewUpdate) => boolean,
  ) {
    this.registry = build_registry(handlers);
    this.extra_rebuild = extra_rebuild;
    this.decorations = build_inline_decorations(
      view.state,
      view.visibleRanges,
      this.registry,
    );
  }

  update(update: ViewUpdate): void {
    // pointer_down_field gates reveal in text_styles.ts / links.ts;
    // its transitions don't change doc / viewport / selection, so a transaction
    // that flips it alone (the document-level mouseup that clears the latch)
    // wouldn't trigger a rebuild here. Without this guard, markers stay
    // suppressed after the user releases the mouse.
    const pointer_changed =
      (update.startState.field(pointer_down_field, false) ?? false) !==
      (update.state.field(pointer_down_field, false) ?? false);
    // Background parsing lands via effect-only transactions; without this,
    // late-parsed regions stay raw until the next edit/scroll/selection.
    const tree_advanced =
      syntaxTree(update.startState) !== syntaxTree(update.state);
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.selectionSet ||
      pointer_changed ||
      tree_advanced ||
      (this.extra_rebuild?.(update) ?? false)
    ) {
      this.decorations = build_inline_decorations(
        update.view.state,
        update.view.visibleRanges,
        this.registry,
      );
    }
  }
}

export function make_inline_decorations_plugin(
  handlers: readonly NodeHandler[],
  extra_rebuild?: (update: ViewUpdate) => boolean,
) {
  return ViewPlugin.define(
    (view) => new InlineDecorationsPlugin(view, handlers, extra_rebuild),
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}
