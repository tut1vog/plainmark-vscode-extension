#!/usr/bin/env node
// Generates docs/spec/_matrix.md by joining declared spec clauses with the test
// IDs that reference them. Format contract: docs/spec/README.md §2, §4, §5.
// Dependency-free (node:fs / node:path only). ESM.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SPEC_DIR = join(ROOT, 'docs', 'spec');
const TEST_GLOBS = ['src', 'tests'];
const MATRIX_PATH = join(SPEC_DIR, '_matrix.md');

const ID_RE = /\b[A-Z][A-Z0-9]*-[A-Z]+-\d+\b/g;
// - **ID** `[tag]` `[tag]` — statement
const CLAUSE_RE = /^\s*-\s+\*\*([A-Z][A-Z0-9]*-[A-Z]+-\d+)\*\*((?:\s*`\[[^\]]+\]`)*)\s+—\s+(.+?)\s*$/;
const TAG_RE = /`\[([^\]]+)\]`/g;

const args = new Set(process.argv.slice(2));
const checkMode = args.has('--check');

function walk(dir, test, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, test, out);
    else if (test(p)) out.push(p);
  }
}

function tierForPath(rel) {
  if (rel.startsWith('tests/visual/') || rel.startsWith('tests/integration/')) return 'tier-b';
  return 'tier-a';
}

// --- 1. Declared clauses -----------------------------------------------------
const clauses = new Map(); // id -> { id, file, statement, tags:Set, line }
const duplicates = [];
const malformed = []; // { file, line, text }

const specFiles = [];
walk(SPEC_DIR, (p) => p.endsWith('.md') && !basename(p).startsWith('_') && basename(p) !== 'README.md', specFiles);

for (const file of specFiles.sort()) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    // A line that starts a bold-ID clause but fails the strict shape is malformed.
    if (/^\s*-\s+\*\*[A-Z][A-Z0-9]*-[A-Z]+-\d+\*\*/.test(text)) {
      const m = CLAUSE_RE.exec(text);
      if (!m) {
        malformed.push({ file: rel, line: i + 1, text: text.trim() });
        return;
      }
      const [, id, tagRegion, statement] = m;
      const tags = new Set();
      let tm;
      TAG_RE.lastIndex = 0;
      while ((tm = TAG_RE.exec(tagRegion))) tags.add(tm[1]);
      if (clauses.has(id)) duplicates.push({ id, a: clauses.get(id).file, b: rel });
      else clauses.set(id, { id, file: rel, statement, tags, line: i + 1 });
    }
  });
}

// --- 1b. Self-containment (docs/spec/README.md §9) ---------------------------
// Normative spec files MUST reference only sibling docs/spec/ files — never code
// (src|tests|scripts/** paths, bare *.ts/*.js filenames) nor docs outside spec/.
const specDirNames = new Set(readdirSync(SPEC_DIR).filter((n) => n.endsWith('.md')));
const CODE_REF_RE = /(?:\b(?:src|tests|scripts|patches|media|dist)\/[\w.@/-]+)|(?:\b[\w.-]+\.(?:ts|tsx|js|cjs|mjs|cts|mts)\b)/g;
// A code reference points "outside" when it is a path under a source dir, or a
// bare filename that resolves to a real repo source file. Bare names matching no
// real file are prose, not references — third-party projects whose name ends in
// a source extension (`highlight.js`) are named as documentation sources, not
// linked to. Same resolve-against-reality rule DOC_REF_RE applies to bare .md.
const sourceFiles = [];
for (const dir of ['src', 'tests', 'scripts', 'patches', 'media']) {
  const p = join(ROOT, dir);
  if (existsSync(p)) walk(p, () => true, sourceFiles);
}
const sourceBaseNames = new Set(sourceFiles.map((p) => basename(p)));
// A doc reference points "outside" when it is a path not under docs/spec/, or a
// bare name that resolves to a real docs/ file outside spec/. Bare names that
// match no real doc (illustrative user filenames like `notes.md`) are ignored.
const DOC_REF_RE = /(?:[\w.-]+\/)*[\w.-]+\.md\b/g;
const outward = []; // { file, line, ref }
for (const file of specFiles) {
  const rel = relative(ROOT, file);
  readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
    let m;
    CODE_REF_RE.lastIndex = 0;
    while ((m = CODE_REF_RE.exec(text))) {
      const ref = m[0];
      if (ref.includes('/') || sourceBaseNames.has(ref)) outward.push({ file: rel, line: i + 1, ref });
    }
    DOC_REF_RE.lastIndex = 0;
    while ((m = DOC_REF_RE.exec(text))) {
      const ref = m[0];
      const outsidePath = ref.includes('/') && !ref.includes('docs/spec/') && !ref.startsWith('spec/');
      const outsideDoc = !ref.includes('/') && !specDirNames.has(ref) && existsSync(join(ROOT, 'docs', ref));
      if (outsidePath || outsideDoc) outward.push({ file: rel, line: i + 1, ref });
    }
  });
}

// --- 2. Automated coverage from test files -----------------------------------
const refs = new Map(); // id -> Set<"tier-a"|"tier-b">
const refFiles = new Map(); // id -> Set<relpath>
const testFiles = [];
for (const g of TEST_GLOBS) {
  walk(join(ROOT, g), (p) => /\.(test|spec)\.[cm]?tsx?$/.test(p), testFiles);
}
for (const file of testFiles) {
  const rel = relative(ROOT, file);
  const tier = tierForPath(rel);
  const text = readFileSync(file, 'utf8');
  let m;
  ID_RE.lastIndex = 0;
  while ((m = ID_RE.exec(text))) {
    const id = m[0];
    if (!refs.has(id)) { refs.set(id, new Set()); refFiles.set(id, new Set()); }
    refs.get(id).add(tier);
    refFiles.get(id).add(rel);
  }
}

// --- 3. Resolve coverage + conformance ---------------------------------------
function resolveCoverage(id, seen = new Set()) {
  if (seen.has(id)) return new Set(); // cycle guard
  seen.add(id);
  const c = clauses.get(id);
  const cov = new Set(refs.get(id) ?? []);
  if (!c) return cov;
  for (const t of c.tags) {
    if (t === 'smoke') cov.add('smoke');
    else if (t === 'build') cov.add('build');
    else if (t === 'accepted') cov.add('accepted');
    else if (t.startsWith('inherits:')) {
      const target = t.slice('inherits:'.length);
      for (const x of resolveCoverage(target, seen)) cov.add(x);
      cov.add('inherited');
    }
  }
  return cov;
}

function conformance(c) {
  if (c.tags.has('divergent')) return 'divergent';
  if (c.tags.has('unknown')) return 'unknown';
  for (const t of c.tags) {
    if (t.startsWith('inherits:')) {
      const target = clauses.get(t.slice('inherits:'.length));
      if (target) return conformance(target);
    }
  }
  if (c.tags.has('accepted')) return 'accepted';
  return 'conforming';
}

const rows = [...clauses.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
const orphans = [...refs.keys()].filter((id) => !clauses.has(id)).sort();

const uncovered = [];
const smokeClauses = [];
const divergentClauses = [];
for (const c of rows) {
  const cov = resolveCoverage(c.id);
  const isUncovered = ![...cov].some((x) => x !== 'inherited');
  if (isUncovered) uncovered.push(c.id);
  if (cov.has('smoke')) smokeClauses.push(c.id);
  if (conformance(c) === 'divergent') divergentClauses.push(c.id);
}

// --- 4. Emit matrix ----------------------------------------------------------
function covLabel(cov) {
  const order = ['tier-a', 'tier-b', 'smoke', 'build', 'accepted', 'inherited'];
  const present = order.filter((x) => cov.has(x));
  return present.length ? present.join(' + ') : 'UNCOVERED';
}

function renderMatrix() {
  const byFile = new Map();
  for (const c of rows) {
    if (!byFile.has(c.file)) byFile.set(c.file, []);
    byFile.get(c.file).push(c);
  }
  let out = '';
  out += '# Spec Coverage & Conformance Matrix\n\n';
  out += '> GENERATED by `pnpm run spec:matrix` — do not hand-edit.\n';
  out += `> Clauses: ${rows.length} · uncovered: ${uncovered.length} · smoke: ${smokeClauses.length} · divergent: ${divergentClauses.length} · orphan test IDs: ${orphans.length}\n\n`;

  for (const [file, cs] of [...byFile.entries()].sort()) {
    out += `## \`${file}\`\n\n`;
    out += '| Clause | Coverage | Conformance | Tests |\n|---|---|---|---|\n';
    for (const c of cs) {
      const cov = resolveCoverage(c.id);
      const tests = [...(refFiles.get(c.id) ?? [])].map((f) => `\`${f.replace(/^.*\//, '')}\``).join(', ') || '—';
      out += `| ${c.id} | ${covLabel(cov)} | ${conformance(c)} | ${tests} |\n`;
    }
    out += '\n';
  }

  if (orphans.length) {
    out += '## ⚠ Orphan test IDs (referenced in tests, not declared in any spec)\n\n';
    for (const id of orphans) out += `- ${id} — ${[...refFiles.get(id)].join(', ')}\n`;
    out += '\n';
  }
  return out;
}

// --- 5. Report / check -------------------------------------------------------
function summary() {
  console.log(`spec-matrix: ${rows.length} clauses across ${specFiles.length} files`);
  console.log(`  uncovered (gap):  ${uncovered.length}${uncovered.length ? ' → ' + uncovered.join(', ') : ''}`);
  console.log(`  smoke (manual):   ${smokeClauses.length}`);
  console.log(`  divergent:        ${divergentClauses.length}${divergentClauses.length ? ' → ' + divergentClauses.join(', ') : ''}`);
  console.log(`  orphan test IDs:  ${orphans.length}${orphans.length ? ' → ' + orphans.join(', ') : ''}`);
  console.log(`  outward refs:     ${outward.length}${outward.length ? ' across ' + new Set(outward.map((o) => o.file)).size + ' file(s)' : ''}`);
  if (duplicates.length) console.log(`  DUPLICATE IDs:    ${duplicates.map((d) => d.id).join(', ')}`);
  if (malformed.length) console.log(`  MALFORMED lines:  ${malformed.map((m) => m.file + ':' + m.line).join(', ')}`);
}

if (checkMode) {
  summary();
  const errs = [];
  if (duplicates.length) errs.push(`${duplicates.length} duplicate clause ID(s)`);
  if (malformed.length) errs.push(`${malformed.length} malformed clause line(s)`);
  if (orphans.length) errs.push(`${orphans.length} orphan test ID(s)`);
  if (outward.length) errs.push(`${outward.length} outward reference(s)`);
  for (const t of [...clauses.values()].flatMap((c) => [...c.tags]).filter((t) => t.startsWith('inherits:'))) {
    const target = t.slice('inherits:'.length);
    if (!clauses.has(target)) errs.push(`inherits target ${target} not declared`);
  }
  if (outward.length) {
    console.error('\noutward references (spec files must be self-contained):');
    for (const o of outward) console.error(`  ${o.file}:${o.line} → ${o.ref}`);
  }
  if (errs.length) {
    console.error('\nspec:check FAILED — ' + errs.join('; '));
    process.exit(1);
  }
  console.log('\nspec:check OK (structural)');
} else {
  writeFileSync(MATRIX_PATH, renderMatrix());
  console.log(`wrote ${relative(ROOT, MATRIX_PATH)}`);
  summary();
}
