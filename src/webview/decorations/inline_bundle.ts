import { RangeSet, type Range } from '@codemirror/state';
import { type Decoration, EditorView } from '@codemirror/view';
import { make_inline_decorations_plugin } from './inline_decorations.js';
import { marker_metrics_changed, marker_metrics_field, blockquote_handlers } from './blockquote.js';
import { code_block_handlers } from './code_block.js';
import { escape_handlers } from './escapes.js';
import { frontmatter_handlers } from './frontmatter.js';
import { heading_handlers } from './headings.js';
import { horizontal_rule_handlers } from './horizontal_rule.js';
import { html_handlers } from './html.js';
import { link_handlers } from './links.js';
import { ListBulletWidget, list_handlers } from './lists.js';
import { text_style_handlers } from './text_styles.js';

// ONE ViewPlugin over the concatenated registry. Each construct module used to
// instantiate its own make_inline_decorations_plugin, which meant ten
// identical full-viewport syntax-tree walks and RangeSet builds per keystroke
// and caret move — again inside every open table-cell subview. build_registry
// merges handler arrays, so a single walk serves them all; concatenation order
// preserves the former per-plugin registration order.
const inline_decorations_plugin = make_inline_decorations_plugin(
  [
    ...text_style_handlers,
    ...escape_handlers,
    ...heading_handlers,
    ...link_handlers,
    ...list_handlers,
    ...blockquote_handlers,
    ...code_block_handlers,
    ...frontmatter_handlers,
    ...html_handlers,
    ...horizontal_rule_handlers,
  ],
  marker_metrics_changed,
);

// The bullet marker is never revealed (B2), so its replaced source span —
// leading whitespace + ListMark + trailing space — must navigate as one atomic
// unit, or the caret would step through hidden bytes one keypress at a time.
// Lives here (not lists.ts) because it reads this plugin's decorations.
const list_atomic_ranges = EditorView.atomicRanges.of((view) => {
  const plugin = view.plugin(inline_decorations_plugin);
  if (!plugin) return RangeSet.empty;
  const ranges: Range<Decoration>[] = [];
  plugin.decorations.between(0, view.state.doc.length, (from, to, deco) => {
    if (deco.spec.widget instanceof ListBulletWidget) ranges.push(deco.range(from, to));
  });
  // Pass sort=true defensively — `between` iterates the source RangeSet in
  // `from` order, but two adjacent ListBulletWidget replace ranges can share
  // a `from` (e.g. an empty bullet line whose marker collapses to zero width
  // alongside a re-revealed neighbour), and the source RangeSet's tie-break
  // by startSide doesn't necessarily survive the filter-and-rebuild here.
  // Without this guard, RangeSet.of throws "Ranges must be added sorted by
  // `from` position and `startSide`".
  return RangeSet.of(ranges, true);
});

// marker_metrics_field is included so marker_metrics_changed can read it even
// in harnesses that mount this bundle without blockquote_extension.
export const inline_decorations_bundle = [
  marker_metrics_field,
  inline_decorations_plugin,
  list_atomic_ranges,
];
