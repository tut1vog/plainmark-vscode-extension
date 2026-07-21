# Plainmark Specification

This directory is the **normative, behavior-first specification** for Plainmark.
It states how each construct *must* render, how the user interacts with it, and
what byte-level guarantees hold.

---

## 1. File layout

- **Per-construct files** (one per construct): `headings.md`, `blockquotes.md`,
  `lists.md`, `tables.md`, … Each uses the fixed four-section template in §3.
- **Cross-cutting files**: `invariants.md`, `marker-reveal-and-selection.md`,
  `caret-and-navigation.md`, `sync-and-persistence.md`, `editor-shell.md`,
  `theming.md`. These own behavior that spans constructs; per-construct files
  reference their clauses via `[inherits:<ID>]` rather than duplicating them.
- **Generated / authored artifacts** (prefixed `_`, never hand-edit `_matrix.md`):
  - `_matrix.md` — **generated** coverage + conformance matrix (`pnpm run spec:matrix`).
  - `_manual-smoke.md` — **generated** manual-smoke list (`pnpm run spec:smoke`):
    every clause whose resolved coverage includes `smoke`.
  - `_backlog.md` — **authored** fix-before-publish backlog (every `[divergent]` clause).
  - `_decision-points.md` — **authored** list of accepted compromises / deferrals
    (every `[accepted]` clause) awaiting owner ratification.

---

## 2. Clause IDs

Every individually testable behavior is one **clause** with a stable ID:

```
<CONSTRUCT>-<SECTION>-<n>
```

- `<CONSTRUCT>` — short uppercase prefix, unique per file (e.g. `BQ`, `INV`,
  `HEAD`, `TBL`). Declared in the file's front matter (`prefix:` key).
- `<SECTION>` — the section code (§3): `R`, `I`, `SP`, `E` for construct files;
  cross-cutting files use their own short codes (e.g. `INV-SP-1`).
- `<n>` — integer, assigned monotonically within `<CONSTRUCT>-<SECTION>`, never
  reused once removed.

IDs are immutable once published. Reword a clause freely; never renumber it.

### Clause line format

A clause is a list item whose first token is the bold ID, optionally followed by
backtick-wrapped `[tag]` tokens, then ` — `, then the normative statement:

```markdown
- **BQ-R-1** — Each blockquote line receives a `Decoration.line` ...
- **BQ-R-5** `[smoke]` — Nesting bars render as stacked background-image layers ...
- **BQ-SP-3** `[inherits:INV-SP-1]` — Bytes outside the blockquote are preserved.
- **HEAD-I-4** `[divergent]` — Enter at end of an ATX heading should ...
```

The matrix generator parses exactly this shape. Use **MUST / MUST NOT / MAY** in
statements to keep them normative.

### Examples per clause

Every clause SHOULD carry a concrete example on an indented continuation line
directly below it, prefixed `_Example:_`. Examples are illustration, not extra
clauses — they are indented (not list items) so the matrix generator ignores
them. Omit only when a clause is genuinely not illustratable (rare).

Notation:

- `|` marks the caret position.
- `→` separates an action or its result: `input → action → output`.
- `\n` is a literal newline; significant trailing spaces are called out in prose.
- Multi-line or before/after states MAY use a fenced block instead of one line.

```markdown
- **BQ-R-2** — The `>` marker and its trailing space MUST be hidden ...
  _Example:_ `> hi` renders as `hi`; the `> ` stays hidden even with the caret on the line.

- **BQ-I-2** — Enter on an empty `> ` line MUST exit the blockquote ...
  _Example:_ `> first\n> |` → Enter → `> first\n\n|`
```

### Linking a clause to its tests

IDs live in **test titles**. The generator scans each test file for ID *tokens*
anywhere in the file, so an ID may be tagged either on an individual
`it(...)` / `test(...)` title or once on the `describe(...)` block that groups a
clause's tests (the whole block then counts for that clause). A title may carry
multiple IDs:

```ts
describe('BQ-R-1 BQ-R-2: single-line blockquote', () => { ... });
it('BQ-I-2: Enter on empty `> ` exits the quote', () => { ... });
```

---

## 3. Per-construct template (fixed section order)

| Code | Section | Contents |
|---|---|---|
| `R`  | **Rendering** | What decorations/widgets are emitted; what is hidden/shown; visual structure, chrome, CSS-variable surface. |
| `I`  | **Interaction** | Keystrokes, caret behavior, click targets, autocomplete, commands — how the user edits the construct. |
| `SP` | **Source preservation** | Byte-level guarantees specific to the construct; cross-cut clauses reference `[inherits:INV-SP-1]`. |
| `E`  | **Edge cases** | Boundary inputs, degenerate forms, composition with other constructs, known regressions pinned as clauses. |

Cross-cutting files are not bound to this template; they declare their own
sections and section codes.

---

## 4. Tag vocabulary

Tags are authored judgments the matrix generator cannot derive from code. Zero or
more per clause.

| Tag | Axis | Meaning |
|---|---|---|
| `[smoke]` | coverage | Requires **manual smoke** verification in a real VS Code webview. Counts as the clause's coverage when no automated test exists; may co-exist with `tier-a`/`tier-b` (defense-in-depth — see §5). Every `[smoke]` clause appears in the close-out manual-smoke list. |
| `[build]` | coverage | Enforced by the build / typecheck / bundler / CI gate, not a test file. No test ID expected. |
| `[accepted]` | coverage + conformance | A deliberate compromise or deferral. No automated coverage expected. Must appear in `_decision-points.md` for owner ratification. |
| `[inherits:<ID>]` | coverage + conformance | Coverage and conformance are taken from the referenced clause (typically an `INV-*` clause). Avoids duplicating cross-cutting tests into every construct file. |
| `[divergent]` | conformance | Code does **not** currently satisfy this normative clause. Must appear in `_backlog.md` (fix-before-publish). Its test is rewritten *as part of the fix*, not during migration. |
| `[unknown]` | conformance | Conformance cannot be determined without a smoke check. Pair with `[smoke]`. |

Default (no tag): coverage is expected from an automated test; conformance is
`conforming`.

---

## 5. Coverage & conformance axes (the matrix)

`pnpm run spec:matrix` regenerates `_matrix.md` by joining:

1. **Declared clauses** — IDs + tags scanned from every `docs/spec/*.md`
   (excluding `_*.md`).
2. **Automated coverage** — every ID token appearing in a test file, classified
   by path:
   - `src/**`, `tests/fuzz/**`, `tests/source-preservation/**` → **`tier-a`** (headless / in-process).
   - `tests/visual/**`, `tests/integration/**` → **`tier-b`** (browser / host).

**Coverage axis** per clause = the union of: tiers from referencing tests, plus
`smoke`/`build`/`accepted` from tags, plus the resolved coverage of an
`[inherits:<ID>]` target. A clause with none of these is **`uncovered`** (a real
gap). `tier-b` and `smoke` co-exist deliberately: a clause whose automated
browser test has previously passed while the bug remained visible under F5 (the
marker-insert-redirect class of bug) carries both.

**Conformance axis** per clause: `divergent` / `unknown` if so tagged, inherited
if `[inherits:<ID>]`, else **`conforming`**.

The **manual-smoke deliverable** is every clause whose coverage includes `smoke`.

---

## 6. Per-construct done-bar

A construct's spec is "done" when all six held:

1. Every behavior is enumerated as an ID'd clause.
2. Every clause is classified on both axes (coverage + conformance).
3. Existing tests for the construct are tagged with their clause IDs (titles).
4. Divergences are in `_backlog.md`; accepted compromises in `_decision-points.md`.
5. **No-knowledge-lost back-check**: every substantive claim from the prior
   per-construct rationale is reflected in a clause or consciously dropped
   (recorded in an artifact).
6. `pnpm run spec:check` is structurally clean for the construct (no duplicate
   IDs, no malformed clause lines, no orphan test IDs).

---

## 7. Commands

- `pnpm run spec:matrix` — regenerate `_matrix.md` + print a summary.
- `pnpm run spec:smoke` — regenerate `_manual-smoke.md` (the manual-smoke deliverable).
- `pnpm run spec:check` — structural integrity check (exit non-zero on duplicate
  IDs, malformed clauses, or orphan test IDs). Coverage-completeness becomes a
  blocking CI gate at the Phase 11 close-out, not before.

---

## 8. Companion docs

The `--plainmark-*` theming surface is specified normatively in `theming.md`
(this directory) and documented for themers in `docs/theming-guide.md`. The
project's testing approach is summarized in the top-level `README.md`.

---

## 9. Self-containment

The normative spec files (per-construct + cross-cutting) are **self-contained**:
each references only sibling `docs/spec/` files — never implementation. A clause
states observable behavior; it does not name the code that implements it.

- **Allowed**: sibling spec files (e.g. `blockquotes.md`), `[inherits:<ID>]`
  clause links, the public contract (`--plainmark-*` variables, `.plainmark-*`
  classes, `data-*` attributes), and library/symbol names where they define
  observable structure (e.g. `Decoration.line`, `ROOT_DEFAULTS_CSS`) — including
  third-party project names ending in a source extension (e.g. `highlight.js`
  cited as a documentation source).
- **Not allowed**: code paths (`src/**`, `tests/**`, `dist/**`), bare source
  filenames that name a real repo source file (e.g. `provider.ts`), and docs
  outside this directory (e.g. `docs/theming-guide.md`). Traceability runs one
  way — tests carry clause IDs in their titles (§2 "Linking a clause to its
  tests"), so code points at the spec, not the reverse. Front matter keeps
  `prefix`/`title`/`kind`; there is **no `source:` key**.
- **Exempt**: `README.md` (this conventions/tooling doc) and the
  generated/authored `_*.md` artifacts (§1), whose job is to map clauses to code.

Enforced by `pnpm run spec:check`, which fails on any outward reference in a
normative spec file.
