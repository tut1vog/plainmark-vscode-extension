#!/usr/bin/env node
// Generates docs/spec/_manual-smoke.md — the manual-smoke deliverable: every
// clause whose resolved coverage includes `smoke` (README §5). The clause
// grammar and renderer live in spec-clauses.mjs, shared with gen-spec-matrix.mjs
// so spec:check can verify the committed file is fresh.

import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { ROOT, SMOKE_PATH, load_clauses, render_smoke_list } from './spec-clauses.mjs';

const { clauses } = load_clauses();
const { text, count, files } = render_smoke_list(clauses);
writeFileSync(SMOKE_PATH, text);
console.log(`wrote ${relative(ROOT, SMOKE_PATH)}`);
console.log(`manual-smoke: ${count} clauses across ${files} files`);
