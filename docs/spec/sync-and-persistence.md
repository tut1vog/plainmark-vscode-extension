---
prefix: SYNC
title: Sync & Persistence
kind: cross-cutting
---

# Sync & Persistence

The bidirectional sync loop between VS Code's `TextDocument` (host) and the
CodeMirror 6 webview, plus persistence, dirty, and save behavior. The webview
owns a CM6 `EditorState`; the host owns the `TextDocument`. This file is the
normative spec for echo suppression (whole-doc replace + inbound identity check)
and undo ownership / dirty / save trade-offs.

The transport is asymmetric. **Webview → host** is a whole-document replace: the
webview posts its entire doc text on any change, and the host applies a single
`WorkspaceEdit` replacing the whole document (granular `WorkspaceEdit`s were
dropped because they diverged under concurrent external `applyEdit`). **Host → webview** applies the incoming
text to CM6 as a minimal-range change — the shared prefix and suffix are trimmed
to the smallest replaced span (`compute_min_diff`) so an external or escaped-echo
`sync` preserves the caret instead of collapsing it to the document start.
There is no `applyEdit` on this direction, so the
2026-05-11 divergence concern does not apply. The webview's CM6 doc is the
LF-normalized form; EOL/BOM translation happens at the host boundary.

Source-preservation, undo, and host-code-separation guarantees are owned by
`invariants.md`; clauses that are those invariants are tagged
`[inherits:INV-...]` rather than restated. Caret-position synchronization
(`cursor_changed` semantics) is owned by `caret-and-navigation.md` §S
(`NAV-S-*`); this file references it rather than restating it.

Notation in examples: `|` = caret, `→` = action/result, `\n` = literal newline.

## Section codes

- **W** — webview → host (CM6 changes flow out as an `update` message → whole-doc `WorkspaceEdit`).
- **H** — host → webview (external edits, reverts, host syncs flow in as a `sync` message).
- **G** — guard / echo-suppression / re-entrancy (`syncAnnotation`, inbound + outbound identity checks, composition deferral).
- **P** — persistence, dirty, save, and `CustomTextEditorProvider` lifecycle.

## W — webview → host

- **SYNC-W-1** — On any CM6 transaction that changes the document, the webview update-listener MUST post an `update` message carrying the entire new doc text (`update.state.doc.toString()`) and a `base_version` — the version of the last host `sync` the webview APPLIED (not merely received; a composition-deferred sync advances the base only once it dispatches). It MUST NOT post granular per-range offset edits. During IME composition the post is deferred per SYNC-G-8.
  _Example:_ `hello|` → type ` world` → webview posts `{ type: 'update', text: 'hello world', base_version: <last applied sync version> }`.

- **SYNC-W-2** — A view update with no document change (`docChanged` false) MUST NOT post an `update` message.
  _Example:_ a selection-only transaction → no `update` posted (a `cursor_changed` may still be posted per SYNC-W-5).

- **SYNC-W-3** — On receiving an `update` message that passes the base-version gate (SYNC-W-8), the host MUST translate the LF text to the document's native EOL and apply it as a single whole-document `WorkspaceEdit.replace` spanning `[positionAt(0), positionAt(getText().length)]`.
  _Example:_ webview `update` with `'a\nb'` on a CRLF document → host replaces the whole range with `'a\r\nb'`.

- **SYNC-W-4** — The host MUST reject an `update` whose target URI does not equal the bound document's URI (`apply_full_replace` returns false without applying).
  _Example:_ an `update` routed to a stale URI string → no `WorkspaceEdit`, returns false.

- **SYNC-W-5** — On a transaction that sets the selection OR changes the document, the webview MUST post a `cursor_changed` message with the main-view caret as zero-based `(line, character)`, deduplicated against the last reported position. Caret-position semantics are owned by `caret-and-navigation.md` (`NAV-S-1`–`NAV-S-4`).
  _Example:_ caret move with no edit → `{ type: 'cursor_changed', line, character }`, no `update`.

- **SYNC-W-6** `[inherits:INV-SP-1]` — Bytes outside the construct the user is editing MUST be preserved verbatim across the webview→host→webview round-trip.
  _Example:_ editing a heading MUST leave a trailing paragraph's bytes byte-identical after the whole-doc replace round-trips.

- **SYNC-W-7** `[inherits:INV-SP-2]` — Only the table widget MAY re-serialize its own source range before the `update` is posted; every other construct's `update` MUST carry only the user's literal keystroke change.
  _Example:_ editing one list item MUST NOT repad sibling items in the posted text.

- **SYNC-W-8** — The host MUST reject an `update` whose `base_version` does not equal the version carried by the last `sync` it posted: no `applyEdit`, and a corrective `sync` of the current host state is posted to re-ground the webview. Conflict rule: the host-side state (the external edit the webview had not yet seen) wins; the rejected update's keystroke is dropped from the wire but remains reachable in the webview's CM6 undo history (syncs are `addToHistory: false`).
  _Example:_ an external edit forwards as `sync` v7; an in-flight `update` with `base_version: 5` arrives → no `WorkspaceEdit`, the host re-posts the v7 text; the webview's typed character is recoverable via Ctrl+Z.

## H — host → webview

- **SYNC-H-1** — On `onDidChangeTextDocument` for the bound document (after the echo gate), the host MUST post a `sync` message carrying the full LF-normalized document text, the document version, and the document-dir webview URI.
  _Example:_ an external editor inserts a line → host posts `{ type: 'sync', text: <whole LF doc>, version, document_dir_webview_uri }`.

- **SYNC-H-2** — The webview MUST apply a `sync` whose text differs from the current doc as a single minimal-range change — the shared prefix and suffix trimmed to the smallest replaced span (`compute_min_diff`) — tagged with `syncAnnotation` and `addToHistory: false` (`make_sync_transaction_spec`). The change MUST reconstruct the incoming text exactly; because it does not span a caret the edit doesn't touch, the caret MUST be preserved (not collapsed to offset 0) across external and escaped-echo syncs.
  _Example:_ an external edit changes a tail word → CM6 dispatches a change covering only that word; a caret earlier in the line stays put, and the dispatch is not added to the undo history.

- **SYNC-H-3** — The host MUST normalize native EOL to LF (`native_to_lf`) before sending text to the webview — both `\r\n` and lone `\r` (matching CM6's own `/\r\n?|\n/` split, so the host LF view always equals the webview doc and a no-input open stays edit-free). The webview's CM6 doc is always LF. Declared consequence: the first real edit on a legacy lone-`\r` file rewrites its EOLs file-wide to the native EOL (INV-SP-1 scope note).
  _Example:_ a CRLF document → the webview receives `'a\nb'`, never `'a\r\nb'`; a classic-Mac `'a\rb'` → the webview receives `'a\nb'`, and the first edit saves back `'a\nb'`-based bytes.

- **SYNC-H-4** `[smoke]` — An external edit to the file (another editor, a file-system change picked up by the workbench) MUST be reflected in the webview without the user re-opening the document.
  _Example:_ edit the same file in the default text editor → the Plainmark view updates live.

- **SYNC-H-5** `[smoke]` — Reverting the file MUST push the on-disk text to the webview as a `sync` and leave the document clean.
  _Example:_ make an edit → File: Revert File → webview shows pre-edit text, no dirty dot.

- **SYNC-H-6** `[inherits:INV-UNDO-2]` — CM6's `history()` owns the undo stack; the workbench Undo/Redo commands MUST be muzzled while Plainmark is the active custom editor so a single Ctrl+Z does not race the host `applyEdit`. A CM6 undo flows out through the normal `update` path.
  _Example:_ Ctrl+Z in the webview → CM6 reverts locally and posts an `update`; the workbench `undo` command, with Plainmark active, does not mutate the `TextDocument`.

- **SYNC-H-7** — On the webview `ready` handshake, the host MUST send a `sync` carrying the current document text so the view renders existing content. The `ready` response MUST be serialized behind the pending `applyEdit` chain, so a webview rebooted while an apply is in flight (configuration change re-sets `webview.html`) is seeded with post-apply text, never the stale pre-apply state.
  _Example:_ webview posts `{ type: 'ready' }` while an `applyEdit` is awaiting → the host's seed `sync` carries the text after that apply settles.

- **SYNC-H-8** `[smoke]` — While a table cell subview is active, a sync-annotated transaction that changes the document MUST be rebased into the subview by the `table_undo_rebase` ViewPlugin (host syncs rewrite the cell's source, but `updateDOM` skips the active cell by design): locate the post-state table through the change mapping probing both association sides (an insertion ending exactly at the table start otherwise reads as a deleted table), retarget the active-cell snapshot when the table shifted, and rebase the subview in place to the fresh cell text under TBL-I-18's rebase rules (clamped caret, `table_sync_annotation`, no history entry); a deleted cell or table tears the subview down via the dimension-change rebuild / widget destroy. Conflict rule: host-side state wins — the subview's un-flushed text is replaced (its local history is empty by design, TBL-I-9; the main view's undo holds the external edit). Without the rebase, the next in-cell keystroke writes the stale subview string back, silently reverting the external edit.
  _Example:_ a split-editor edit rewrites the active cell `1` → `one` → the subview shows `one`; typing `X` then posts `| oneX |`, never `| 1X |`.

## G — guard / echo-suppression / re-entrancy

The combined echo-suppression strategy is three gates: a
version-keyed inbound host-side gate, an outbound webview→host identity check,
and the CM6 `syncAnnotation` gate. One `applyEdit` fires
`onDidChangeTextDocument` N≥2 times, **all at the same `document.version`** —
which a counting/boolean gate cannot fit (since superseded), a single-text
snapshot leaks under back-to-back applies, and a byte-equality window over past
submissions swallows external edits whose bytes match one.
Since versions are never reused, the gate suppresses on the set of versions
Plainmark's own applyEdits produced; byte equality survives only to classify the
first fire of the single in-flight apply.

- **SYNC-G-1** — The webview update-listener MUST skip posting to the host when any transaction in the update carries `syncAnnotation`, so a host→view `sync` MUST NOT be echoed back as an `update`.
  _Example:_ `make_sync_transaction_spec`-built dispatch → `create_update_listener` posts zero `update` messages.

- **SYNC-G-2** — On `onDidChangeTextDocument`, the host MUST suppress the outbound `sync` when `document.version` is a recorded self-applied version, or when an `applyEdit` is in flight and `document.getText()` equals its submission (the fire that records that version). All other events MUST forward — including an external edit whose bytes equal a past submission, which always carries a fresh version.
  _Example:_ undo in a split text editor reverts the doc to bytes Plainmark submitted earlier → the event's version was produced by no self-`applyEdit` → the `sync` forwards; a deferred dirty-state fire of a back-to-back `applyEdit` reports that apply's recorded version → suppressed.

- **SYNC-G-3** — The in-flight submission MUST be armed BEFORE awaiting `applyEdit` (VS Code dispatches the change event during the await, not after) and cleared when the apply settles, success or failure. The version produced by a successful apply MUST be recorded in the bounded self-version set — at the first matching fire, or after the await if no fire arrived during it; a failed or thrown apply records nothing. The set is capped (oldest evicted first); old versions cannot recur, so eviction never un-suppresses a live echo.
  _Example:_ webview `update` → host arms `incoming` pre-await → echo fire records the new version and suppresses → later fires at that version suppress → a later external edit carries a new version and forwards.

- **SYNC-G-4** — On an incoming `update`, the host MUST short-circuit (no `applyEdit`) when the incoming text equals the current document text (the outbound webview→host identity gate).
  _Example:_ an `update` whose text already equals `get_text()` → no `WorkspaceEdit`, no dirty change.

- **SYNC-G-5** — The webview MUST skip dispatching an incoming `sync` whose text equals the current CM6 doc text; if a `selection_anchor` or effects accompany it, only the selection/effects MUST be dispatched, with no doc change.
  _Example:_ `sync` text equal to the current doc, no anchor → `dispatch_host_sync` performs zero dispatches.

- **SYNC-G-6** `[smoke]` — When an external write of the exact in-flight submission bytes lands while that `applyEdit` is awaiting, the inbound gate (SYNC-G-2) MAY silently absorb the forward; this is an accepted degenerate case (the webview already shows the correct text). Once the apply settles, an idempotent external edit MUST forward (a no-op for the webview per SYNC-G-5).
  _Example:_ a second extension re-applies Plainmark's own bytes mid-await → no second `sync`; the same write after the apply settles → forwarded, webview applies nothing.

- **SYNC-G-7** — While CM6 is composing (`view.composing || view.compositionStarted`), the webview MUST defer applying an incoming `sync` via `setTimeout` (~60 ms) and re-check on retry, so an inbound dispatch does not null CM6's tracked composition range mid-IME. Deferred syncs coalesce newest-wins: each `dispatch_host_sync` bumps a per-view generation, and a deferred sync whose generation has been superseded MUST drop itself on retry (never dispatch, never fire `on_applied`) — otherwise its stale text would overwrite a newer sync already applied, and the next keystroke's `update` would write the regression back to the host.
  _Example:_ a `sync` arrives during CJK punctuation input → dispatch is deferred until composition unwinds, then re-evaluated against the then-current doc; if a newer `sync` arrived meanwhile, the deferred one is dropped and only the newest applies.

- **SYNC-G-8** — While CM6 is composing (`view.composing || view.compositionStarted`), the webview update-listener MUST NOT post intermediate `update` messages; it MUST defer and post the composed text once after composition unwinds (debounced ~60 ms re-check). This stops the host `TextDocument` from churning mid-IME — the per-step `applyEdit` + multi-fire echo churn that otherwise manufactures the escaped-echo divergent syncs SYNC-G-7 and SYNC-H-2 absorb.
  _Example:_ typing a multi-character pinyin word → zero `update` messages during composition, one `update` carrying the final text after `compositionend`.

## P — persistence, dirty, save, lifecycle

- **SYNC-P-1** — Plainmark MUST NOT maintain its own dirty flag or persistence layer; dirty state MUST be derived solely from the `TextDocument` mutated via `WorkspaceEdit`.
  _Example:_ an `update` that changes bytes → the workbench shows the dirty dot; Plainmark stores no dirty boolean.

- **SYNC-P-2** `[smoke]` — A webview edit that changes document bytes MUST mark the document dirty (via the host `WorkspaceEdit`).
  _Example:_ type a character in the view → editor tab shows the unsaved-changes indicator.

- **SYNC-P-3** — Plainmark MUST NOT issue its own save calls; saving is driven by the workbench (`CustomTextEditorProvider` delegates save to the host `TextDocument`).
  _Example:_ Ctrl+S → the workbench writes the document; Plainmark performs no separate persistence step.

- **SYNC-P-4** `[accepted]` `[smoke]` — Under `files.autoSave: afterDelay`, the editor tab MAY show a lingering dirty dot on each edit until the autosave timer clears it; Plainmark MUST NOT add an extension-side self-save to mask it. This is an accepted `CustomTextEditorProvider` limitation.
  _Example:_ with `afterDelay` autosave on → the dirty dot lingers briefly per edit; `onFocusChange` avoids it.

- **SYNC-P-5** `[inherits:INV-SP-4]` `[smoke]` — Opening a document, providing no input, and closing it MUST produce zero `WorkspaceEdit`s and MUST NOT mark the document dirty.
  _Example:_ open → click around without typing → close → no dirty dot, no save prompt.

- **SYNC-P-6** `[inherits:INV-SP-3]` `[smoke]` — Encoding, EOL, BOM, and final-newline behavior MUST follow the `TextDocument`; the sync loop's only EOL action is LF↔native translation at the host boundary, adding or removing nothing else.
  _Example:_ a CRLF document with no final newline, edited in Plainmark and saved → stays CRLF with no final newline added.

- **SYNC-P-7** `[inherits:INV-HOST-1]` `[build]` — The host provider MUST NOT import Node built-ins; the Web host depends on this, so nonce generation uses Web Crypto (`crypto.getRandomValues`) rather than `node:crypto`.
  _Example:_ adding `import { randomBytes } from 'node:crypto'` to the host provider fails the browser-target bundle.

- **SYNC-P-8** — `resolveCustomTextEditor` MUST enable scripts, set the webview HTML with a per-resolve nonce-scoped CSP (`script-src 'nonce-…'`, `default-src 'none'`), and register the document-change, webview-message, view-state, and configuration subscriptions.
  _Example:_ resolve → CSP restricts scripts to the generated nonce; `onDidChangeTextDocument` and `onDidReceiveMessage` are wired through the sync loop.

- **SYNC-P-9** — On `webviewPanel.onDidDispose`, the provider MUST dispose every subscription it registered (message, document-change, view-state, configuration, style watch) and remove the panel from its tracking maps, leaving no dangling listeners.
  _Example:_ close the editor → `sub_msg`, `sub_change`, `sub_view_state`, `sub_config`, and `style_watch` are all disposed.

- **SYNC-P-10** — The host MUST ignore document-change events whose document URI does not match the editor's bound document.
  _Example:_ an edit to an unrelated open file → `onDidChangeTextDocument` returns before reaching the sync loop.

- **SYNC-P-11** — The provider MUST register with `webviewOptions: { retainContextWhenHidden: true }` so a hidden Plainmark tab keeps its CM6 state instead of reloading on re-focus.
  _Example:_ switch away from and back to a Plainmark tab → the CM6 view and caret are retained.

- **SYNC-P-12** `[smoke]` — A `plainmark.styles` configuration change for the bound document MUST reload the webview HTML (rebooting the webview process); CM6 state is then rebuilt via the `ready` handshake and a fresh `sync`.
  _Example:_ change `plainmark.styles` → webview reboots → `ready` → host re-sends the document.

- **SYNC-P-13** `[smoke]` — On the bound panel's view-state transition from inactive to active (a tab switch back to a retained Plainmark editor), the host MUST post a `focus_editor` message and the webview MUST call `view.focus()`. VS Code returns focus to the webview iframe but NOT to the inner CM6 contenteditable, and CM6 renders the caret (`.cm-cursor`) only while the content holds focus (`.cm-focused`), so the retained caret (SYNC-P-11) is otherwise present in state but invisible until the user clicks in. The host MUST post ONLY on the inactive→active edge — never while the panel is already active — so reactivation never steals focus from another workbench surface.
  _Example:_ place the caret mid-document → switch to another tab → switch back → the caret reappears blinking where it was, ready to type with no click.
