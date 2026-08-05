// Single source of truth for `plainmark.prettify.seams`, shared by the host
// (resolves the setting, ships the result in the command message) and the
// webview (looks up a seam while building the transform). Pure — no vscode,
// DOM, or CodeMirror imports — so it bundles into both targets and the
// resolver is exercised by tier-a unit tests. → docs/spec/paragraphs.md PARA-I-8

export const SEAM_KINDS = [
  'frontmatter',
  'heading',
  'paragraph',
  'list',
  'quote',
  'code',
  'indentedCode',
  'table',
  'math',
  'rule',
  'html',
  'definition',
] as const;

export type SeamKind = (typeof SEAM_KINDS)[number];
type SeamPattern = SeamKind | '*';

// A seam never carries more than a screenful of blank lines; anything larger is
// a typo, not an intent.
const MAX_SEAM_BLANKS = 3;

export interface SeamOverride {
  above: SeamPattern;
  below: SeamPattern;
  blanks: number;
}

export interface SeamOverrideResolution {
  resolved: readonly SeamOverride[];
  warnings: readonly string[];
}

const KIND_SET: ReadonlySet<string> = new Set(SEAM_KINDS);

// Both sides pinned wins; then the block BELOW pinned, which is the side a blank
// line reads as belonging to (a blank opens the block under it); then the block
// above; then the catch-all.
function specificity(override: SeamOverride): number {
  const below_exact = override.below !== '*';
  const above_exact = override.above !== '*';
  if (above_exact && below_exact) return 3;
  if (below_exact) return 2;
  if (above_exact) return 1;
  return 0;
}

function parse_side(raw: string): SeamPattern | null {
  const side = raw.trim();
  if (side === '*') return '*';
  return KIND_SET.has(side) ? (side as SeamKind) : null;
}

export function resolve_prettify_seams(value: unknown): SeamOverrideResolution {
  const warnings: string[] = [];
  if (value === undefined || value === null) return { resolved: [], warnings };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { resolved: [], warnings: ['plainmark.prettify.seams: expected an object — ignored.'] };
  }

  const resolved: SeamOverride[] = [];
  const seen = new Set<string>();
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const parts = key.split('>');
    if (parts.length !== 2) {
      warnings.push(
        `plainmark.prettify.seams: "${key}" is not an "above>below" pair — ignored.`,
      );
      continue;
    }
    const above = parse_side(parts[0]);
    const below = parse_side(parts[1]);
    if (above === null || below === null) {
      const bad = above === null ? parts[0].trim() : parts[1].trim();
      warnings.push(
        `plainmark.prettify.seams."${key}": unknown block kind "${bad}" — ignored.`,
      );
      continue;
    }
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > MAX_SEAM_BLANKS) {
      warnings.push(
        `plainmark.prettify.seams."${key}": expected an integer 0–${MAX_SEAM_BLANKS} — ignored.`,
      );
      continue;
    }
    const canonical = `${above}>${below}`;
    if (seen.has(canonical)) {
      warnings.push(
        `plainmark.prettify.seams."${key}": duplicates "${canonical}" — the earlier entry is kept.`,
      );
      continue;
    }
    seen.add(canonical);
    resolved.push({ above, below, blanks: raw });
  }

  resolved.sort((a, b) => specificity(b) - specificity(a));
  return { resolved, warnings };
}

// Blank count the user pinned for this seam, or null when none applies. The
// caller still clamps the result to the seam's parse-safety floor.
export function lookup_seam_override(
  overrides: readonly SeamOverride[],
  above: SeamKind,
  below: SeamKind,
): number | null {
  for (const override of overrides) {
    if (override.above !== '*' && override.above !== above) continue;
    if (override.below !== '*' && override.below !== below) continue;
    return override.blanks;
  }
  return null;
}
