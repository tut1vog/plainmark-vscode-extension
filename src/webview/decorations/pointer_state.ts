import {
  type EditorSelection,
  type EditorState,
  type Extension,
  StateEffect,
  StateField,
} from '@codemirror/state';
import { EditorView, ViewPlugin, type PluginValue } from '@codemirror/view';
import {
  capture_hidden_tail_press,
  take_hidden_tail_remap,
} from './hidden_tail_click.js';
import { compute_double_click_trim, compute_marker_snap } from './selection_snap.js';
import { should_reveal_for_selection } from './selection_reveal.js';

// Latched true between mousedown on the editor and the next document-level
// mouseup. Read by text_styles.ts / links.ts to suppress marker reveal during
// an in-progress drag — flipping markers from `display:none` to inline mid-drag
// shifts text width and breaks the user's drag aim. Typora has the same gate.
//
// Exported so callers that create a view mid-press (e.g., the table widget's
// click-to-activate subview, where mousedown fires on the main view but the
// cell subview doesn't exist until rAF) can manually seed the latch.
export const set_pointer_down = StateEffect.define<boolean>();

export const pointer_down_field = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(set_pointer_down)) return effect.value;
    }
    return value;
  },
});

// The selection captured at mouse-press, BEFORE the click moves the caret (the
// press listener runs in the capture phase, ahead of CM6's own mousedown). Held
// for the duration of the press, null when no button is down. Blockquote reveal
// reads it to FREEZE the `>` at its pre-press state — so a press neither hides
// an already-shown `>` nor reveals a hidden one; the live selection takes over
// only on release.
export const set_frozen_reveal_selection = StateEffect.define<EditorSelection | null>();

export const frozen_reveal_selection_field = StateField.define<EditorSelection | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(set_frozen_reveal_selection)) return effect.value;
    }
    // An edit landing mid-press would otherwise leave the frozen offsets on pre-edit bytes.
    return value && tr.docChanged ? value.map(tr.changes) : value;
  },
});

// Listen directly via addEventListener on scrollDOM (not via CM6's
// domEventHandlers / domEventObservers facets) because CM6's
// `eventBelongsToEditor` short-circuits ALL handlers AND observers when
// `event.defaultPrevented === true` (`input.ts` `eventBelongsToEditor`,
// dist/index.js:4814). The table widget's `td.mousedown` calls preventDefault
// to suppress browser caret placement (it activates the cell subview
// instead), so a CM6-registered listener never fires for the bubble through
// main.contentDOM — leaving main.pointer_down stuck false through the
// activation click. Direct addEventListener bypasses that gate.
//
// scrollDOM, not contentDOM: the content column is a centered max-width
// strip, and a press in the blank scroller area right of it never bubbles
// through contentDOM — yet the browser's native placement still moves the
// caret there (synced back via CM6's selection observer). Binding at
// scrollDOM keeps the hidden-tail capture and the reveal-freeze latch in
// play for those presses (NAV-N-9).
const mousedown_listener_plugin = ViewPlugin.fromClass(
  class implements PluginValue {
    private readonly handle_down: (event: MouseEvent) => void;
    constructor(private readonly view: EditorView) {
      this.handle_down = (event: MouseEvent): void => {
        if (event.button !== 0) return;
        // Capture phase: markers still render per the pre-press selection, so the hidden-tail geometry is the one the user clicked against.
        capture_hidden_tail_press(this.view, event);
        if (!this.view.state.field(pointer_down_field, false)) {
          this.view.dispatch({
            effects: [
              set_pointer_down.of(true),
              // Capture phase: state.selection is still the pre-click selection.
              set_frozen_reveal_selection.of(this.view.state.selection),
            ],
          });
        }
      };
      view.scrollDOM.addEventListener('mousedown', this.handle_down, true);
    }
    destroy(): void {
      this.view.scrollDOM.removeEventListener('mousedown', this.handle_down, true);
    }
  },
);

// Document-level mouseup — CM6's native drag handlers also bind to the document
// so a release outside the editor DOM still ends the drag. Editor-DOM-only
// would leak a stuck `pointer_down=true` if the user releases off-view.
//
// Also fires the Typora-style auto-include-markers snap: if the post-
// drag selection lies inside the content area of an emphasis-family node, the
// snapped selection is dispatched in the SAME transaction as the
// `set_pointer_down(false)` effect so the reveal-gate flip and the snap land
// together (no intermediate frame where reveal is unblocked but selection is
// still bare).
const document_mouseup_plugin = ViewPlugin.fromClass(
  class implements PluginValue {
    private readonly handle_up: (event: MouseEvent) => void;
    private readonly handle_move: (event: MouseEvent) => void;
    constructor(private readonly view: EditorView) {
      const release = (event: MouseEvent): void => {
        if (!this.view.state.field(pointer_down_field, false)) return;
        const release_effects = [
          set_pointer_down.of(false),
          set_frozen_reveal_selection.of(null),
        ];
        // A drag folds the markers in (snap), but only for a construct hidden
        // when the press began — `should_reveal_for_selection` reads the frozen
        // pre-press selection while the latch is still down, so an already-revealed
        // construct is left alone (MRS-S-12). A double-click (detail===2) keeps
        // markers OUT — it never snaps and trims any its word selection swept in,
        // e.g. underscore `_em_` (MRS-S-10, MRS-S-11).
        // The hidden-tail remap moves a plain click's caret past a collapsed
        // trailing run (NAV-N-9); it wins over the snap because an armed press
        // is a caret-placement gesture, never a drag. Snap then adjusts
        // non-empty drags.
        const remap = take_hidden_tail_remap(this.view, this.view.state);
        const adjusted =
          remap !== null
            ? null
            : event.detail === 2
              ? compute_double_click_trim(this.view.state)
              : compute_marker_snap(this.view.state, (from, to) =>
                  should_reveal_for_selection(this.view.state, from, to),
                );
        if (remap !== null) {
          this.view.dispatch({ selection: { anchor: remap }, effects: release_effects });
        } else if (adjusted) {
          this.view.dispatch({ selection: adjusted, effects: release_effects });
        } else {
          this.view.dispatch({ effects: release_effects });
        }
      };
      // Only the primary button latches (handle_down), so only its release ends the press.
      this.handle_up = (event: MouseEvent): void => {
        if (event.button === 0) release(event);
      };
      // A release outside the webview iframe is delivered to the outer window, never here, so it is unobservable while the cursor stays out; a button-less move on return proves the press ended and recovers the otherwise-stuck latch.
      this.handle_move = (event: MouseEvent): void => {
        if (event.buttons === 0) release(event);
      };
      document.addEventListener('mouseup', this.handle_up);
      this.view.scrollDOM.addEventListener('mousemove', this.handle_move);
    }
    destroy(): void {
      document.removeEventListener('mouseup', this.handle_up);
      this.view.scrollDOM.removeEventListener('mousemove', this.handle_move);
    }
  },
);

export const pointer_state_extension: Extension = [
  pointer_down_field,
  frozen_reveal_selection_field,
  mousedown_listener_plugin,
  document_mouseup_plugin,
];

// True when the press/release pointer-freeze flipped between two states. The
// flip lands as effects only (no doc or selection change on release), so every
// reveal-driven decoration field must rebuild on it or the on-release reveal
// never happens; pointer_down_field matters because should_reveal_for_selection
// suppresses reveal while the pointer is down.
export function reveal_gate_changed(before: EditorState, after: EditorState): boolean {
  return (
    before.field(frozen_reveal_selection_field, false) !==
      after.field(frozen_reveal_selection_field, false) ||
    (before.field(pointer_down_field, false) ?? false) !==
      (after.field(pointer_down_field, false) ?? false)
  );
}
