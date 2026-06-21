# Fix-Before-Publish Backlog

Authored. Every clause tagged `[divergent]` in a spec file MUST appear here, with
the observed behavior and the fix direction. A divergent clause's test is
rewritten **as part of the fix**, not during migration. `spec:check` warns if a
`[divergent]` clause is missing from this list.

Empty at the template gate (T29.1) — no divergences found while specifying
`invariants.md` + `blockquotes.md`. Entries land as construct fan-out surfaces
spec-vs-code mismatches.

| Clause | Observed (code) | Required (spec) | Fix direction | Found in |
|---|---|---|---|---|
| LINK-E-2 | Reference links `[text][ref]` get no `plainmark-link` decoration; `link_handler` only matches the inline `Link` shape (≥4 `LinkMark` children ending in `)`), so the `LinkReference` node is unhandled and `[text][ref]` renders as raw text. | Reference links should render as styled links (resolving the `[ref]` definition) with the same marker reveal/hide as inline links. | Add a `LinkReference` handler (or extend `link_handler`) that resolves the definition and decorates the bracketed text; rewrite the failing-spec test as part of the fix. | T29.3 (links.md) |
| LINK-E-3 | Reference definitions `[ref]: url` get no decoration; the definition's `URL` child has a `LinkReference` parent (in `URL_PARENT_OWNED`) so the bare-URL handler skips it and nothing else claims it — the line renders verbatim. | A definition line should be styled/dimmed (it is editor chrome, not prose) consistently with the reference links it backs. | Add a definition-line decoration once LINK-E-2 lands; decide dim-vs-hide with the owner. | T29.3 (links.md) |

_Phase 12 (T30) per-line-reveal divergences BQ-R-2 / BQ-I-11 / CALL-R-3 / CALL-I-1 were resolved in T30.2–T30.4 and removed from this list; they are now conforming and F5-confirmed._
