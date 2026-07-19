# Fix-Before-Publish Backlog

Authored. Every clause tagged `[divergent]` in a spec file MUST appear here, with
the observed behavior and the fix direction. A divergent clause's test is
rewritten **as part of the fix**, not during migration. `spec:check` warns if a
`[divergent]` clause is missing from this list.

Empty at the template gate — no divergences found while specifying
`invariants.md` + `blockquotes.md`. Entries land as construct fan-out surfaces
spec-vs-code mismatches.

| Clause | Observed (code) | Required (spec) | Fix direction | Found in |
|---|---|---|---|---|

_The per-line-reveal divergences BQ-R-2 / BQ-I-11 / CALL-R-3 / CALL-I-1 were resolved by that rework and removed from this list; they are now conforming and F5-confirmed. LINK-E-2 / LINK-E-3 were resolved by the ADR-0003 triage (reference-link rendering + definition-line dim implemented) and removed; MATH-E-3 / MMD-E-11 were retagged `[accepted]` by the same triage._
