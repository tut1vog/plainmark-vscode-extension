// Pure classifier for `plainmark.styles` entries. No `vscode` import — kept
// vscode-free so vitest (which can't resolve the host-provided `vscode`
// module) can exercise the path-shape logic in isolation. The vscode-using
// integration lives in `styles.ts`.
//
// v1 scope per THEME-R-2: `file:` URIs, absolute paths, and
// workspace-relative paths only. `http:` / `https:` declined (supply-chain
// surface not justified by current demand).

export type StyleEntryKind =
  | { kind: 'file_uri'; raw: string }
  | { kind: 'absolute_path'; raw: string }
  | { kind: 'relative_path'; raw: string }
  | { kind: 'declined_remote'; raw: string }
  | { kind: 'invalid'; raw: string; reason: string };

const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const REMOTE_SCHEME_RE = /^https?:/i;
const FILE_SCHEME_RE = /^file:/i;

export function classify_style_entry(entry: unknown): StyleEntryKind {
  if (typeof entry !== 'string') {
    return { kind: 'invalid', raw: String(entry), reason: 'not a string' };
  }
  if (entry.length === 0) {
    return { kind: 'invalid', raw: entry, reason: 'empty string' };
  }
  if (REMOTE_SCHEME_RE.test(entry)) {
    return { kind: 'declined_remote', raw: entry };
  }
  if (FILE_SCHEME_RE.test(entry)) {
    return { kind: 'file_uri', raw: entry };
  }
  if (entry.startsWith('/') || WINDOWS_DRIVE_RE.test(entry)) {
    return { kind: 'absolute_path', raw: entry };
  }
  return { kind: 'relative_path', raw: entry };
}
