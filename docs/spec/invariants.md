---
prefix: INV
title: Hard Invariants
kind: cross-cutting
---

# Invariants — Specification

The rules Plainmark cannot violate. These are cross-cutting: per-construct specs
reference them via `[inherits:INV-…]` rather than restating them.

Section codes: `SP` source preservation · `UNDO` undo semantics · `HOST` host/web separation.

## SP · Source preservation

- **INV-SP-1** — For any edit, every byte **outside** the edited construct's source range MUST be byte-identical before and after the edit cycle. No sync path visits untouched constructs. Scope: this guarantee applies to `\n` and `\r\n` documents; legacy lone-`\r` (classic-Mac) EOLs are out of scope — opening such a file plus the first edit normalizes its EOLs file-wide to the document's native EOL, a declared behavior, and a no-input open still writes nothing (INV-SP-4 holds for all EOL flavors).
  _Example:_ in `para A\n\n| a | b |\n|---|---|\n\npara B`, editing cell `b` leaves `para A`, the blank lines, and `para B` byte-for-byte unchanged.

- **INV-SP-2** — Only the table widget MAY re-serialize source, and only within its own table range: column-uniform padding (P3), unescaped-pipe escape (E1), `\n`↔`<br>` round-trip (N4), mismatched-column normalization (MC1), and at most one trailing newline byte adjacent to the table (TA2). Additionally, table cell-exit navigation MAY write at most one newline byte directly adjacent to the table — leading at offset 0 or trailing at end of document — so the exiting caret has a real source line to land on (TBL-SP-12). Every other widget, decoration, and navigation path MUST be render-only. Adding any new source-mutating widget or path requires a recorded decision.
  _Example:_ typing in a cell of `|a|b|\n|-|-|` may repad it to `| a | b |\n| - | - |` (inside the table range only); editing a heading, list, or blockquote MUST NOT rewrite any bytes.

- **INV-SP-3** `[smoke]` — Encoding, line endings (EOL), BOM, and final-newline behavior MUST follow VS Code's `TextDocument`; Plainmark MUST NOT add or remove normalizations at the file-I/O layer.
  _Example:_ a CRLF file with no trailing newline, opened and edited in Plainmark, saves back as CRLF with no trailing newline added.

- **INV-SP-4** — The open→(no user input)→close cycle MUST emit zero `WorkspaceEdit`s and leave the buffer byte-identical (no phantom edits on load).
  _Example:_ open `# Title\n\ntext`, click around without typing, close → document is never marked dirty and bytes are identical.

## UNDO · Undo semantics

- **INV-UNDO-1** — Every table cell edit MUST produce exactly one CM6 transaction in the main view, so one Ctrl+Z reverts the keystroke (and any column-uniform repad it triggered) atomically.
  _Example:_ typing `x` in cell A1 of a ragged table repads the whole table in one transaction; one Ctrl+Z removes the `x` and the repad together, with no intermediate state.

- **INV-UNDO-2** — CM6 owns the undo history; the workbench Undo/Redo commands MUST be muzzled while Plainmark is the active custom editor, so a single Ctrl+Z does not race `applyEdit`.
  _Example:_ with a Plainmark tab focused, Ctrl+Z is handled by CM6's history, not by VS Code's global undo (which would otherwise fire concurrently).

## HOST · Host / Web separation

- **INV-HOST-1** `[build]` — The host entry points and every host-side module MUST NOT import Node built-ins (`fs`, `path`, `child_process`, `os`, `crypto`, `stream`, `http`, `https`, `net`, `dns`). Enforced by the browser-target esbuild bundle in `build:check`, and flagged earlier by a `no-restricted-imports` eslint rule scoped to host and webview source.
  _Example:_ adding `import { readFileSync } from 'node:fs'` to a host-side module fails the web build at bundle time.
