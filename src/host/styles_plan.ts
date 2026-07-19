// Pure resolution + watch-orchestration logic behind `plainmark.styles`. Kept
// vscode-free — like full_replace.ts / webview_html.ts / link_click.ts /
// styles_resolve.ts — so vitest can exercise the resolution CONTRACT (which
// config entry resolves against which base, what warnings aggregate, which
// resource roots are emitted and how they dedup) and the watcher wiring (one
// watcher per resolved file, `style_reload` on change AND create, failures
// swallowed) without a live `vscode.Uri` / `vscode.workspace` / `Webview`.
//
// The vscode-specific URI arithmetic (`Uri.parse` / `Uri.file` / `Uri.joinPath`,
// `asWebviewUri`, `createFileSystemWatcher` / `RelativePattern`) is injected
// behind a minimal facade generic over the URI type `U`; styles.ts wires the
// real `vscode.Uri` operations and this module orchestrates them, so its output
// is identical to the previous inline resolver for identical inputs
// (INV-HOST-1, THEME-R-12).
//
// Contract: THEME-R-1 (non-array → empty set, no warnings), THEME-R-2 (entry
// classification, in styles_resolve.ts), THEME-R-3 (declined/invalid skipped +
// warned, remaining entries still resolved), THEME-R-4 (relative → first
// workspace folder, else the document dir; absolute → Uri.file; file: →
// Uri.parse), THEME-R-5 (each stylesheet's parent dir added to
// localResourceRoots, deduplicated; href via asWebviewUri), THEME-R-9 (per-file
// watcher whose change/create posts `{type:'style_reload', href}`; registration
// failures swallowed).

import { classify_style_entry } from './styles_resolve.js';

// Minimal URI facade — the pure planner never touches `vscode.Uri` directly;
// styles.ts passes the real operations, tests pass string fakes.
export interface StyleUriOps<U> {
  /** Parse a `file:` URI string into a URI (strict — throws on malformed input). */
  parse_file_uri(raw: string): U;
  /** Build a URI from an absolute filesystem path. */
  from_absolute_path(raw: string): U;
  /** Join a relative path segment onto a base URI. */
  join(base: U, relative: string): U;
  /** The parent-directory URI of `uri` (the `..` join). */
  parent(uri: U): U;
  /** Stable string identity — the resource-root dedup key. */
  to_string(uri: U): string;
  /** The webview-loadable `href` for a local file URI. */
  to_webview_href(uri: U): string;
}

export interface StyleBases<U> {
  /** First workspace folder URI, or null when the window has no folders. */
  workspace_folder: U | null;
  /**
   * The bound document's directory URI, as a thunk so it is computed only when
   * actually needed (a relative entry with no workspace folder) — matching the
   * lazy `Uri.joinPath(document_uri, '..')` of the original inline resolver.
   */
  document_dir: () => U;
}

export interface PlannedStyle<U> {
  /** Webview-loadable URI string for `<link href>`. */
  href: string;
  /** Local-filesystem URI; the watcher target. */
  local_uri: U;
}

export interface StylePlan<U> {
  resolved: PlannedStyle<U>[];
  /** Parent directories to add to `localResourceRoots` (deduplicated by string). */
  resource_roots: U[];
  /** Operator-visible warnings, in entry order. */
  warnings: string[];
}

export function plan_plainmark_styles<U>(
  raw: unknown,
  bases: StyleBases<U>,
  ops: StyleUriOps<U>,
): StylePlan<U> {
  // THEME-R-1: a non-array value resolves to an empty style set with no warnings.
  if (!Array.isArray(raw)) return { resolved: [], resource_roots: [], warnings: [] };

  const resolved: PlannedStyle<U>[] = [];
  // Keyed by `to_string(parent)` so distinct URI objects sharing a directory
  // collapse to one root — THEME-R-5 dedup "by string".
  const resource_root_set = new Map<string, U>();
  const warnings: string[] = [];

  for (const entry of raw) {
    const classified = classify_style_entry(entry);
    // THEME-R-3: an invalid/declined entry is skipped with a warning and does
    // NOT abort resolution of the remaining entries.
    if (classified.kind === 'invalid') {
      warnings.push(`plainmark.styles: ignored entry — ${classified.reason}`);
      continue;
    }
    if (classified.kind === 'declined_remote') {
      warnings.push(
        `plainmark.styles: ignored remote URL "${classified.raw}" — http(s):// is unsupported in v1`,
      );
      continue;
    }

    let local_uri: U;
    try {
      // THEME-R-4: each classified kind resolves against its own base.
      if (classified.kind === 'file_uri') {
        local_uri = ops.parse_file_uri(classified.raw);
      } else if (classified.kind === 'absolute_path') {
        local_uri = ops.from_absolute_path(classified.raw);
      } else {
        // relative_path — first workspace folder, falling back to the document dir.
        const base = bases.workspace_folder ?? bases.document_dir();
        local_uri = ops.join(base, classified.raw);
      }
    } catch {
      warnings.push(`plainmark.styles: failed to parse "${classified.raw}"`);
      continue;
    }

    // THEME-R-5: the stylesheet's parent dir becomes a (deduped) resource root;
    // its href is the webview-loadable URI.
    const parent = ops.parent(local_uri);
    resource_root_set.set(ops.to_string(parent), parent);
    resolved.push({ href: ops.to_webview_href(local_uri), local_uri });
  }

  return {
    resolved,
    resource_roots: Array.from(resource_root_set.values()),
    warnings,
  };
}

// --- watch orchestration -----------------------------------------------------

export interface Disposable {
  dispose(): void;
}

/** One filesystem watcher's change/create subscription surface. */
export interface StyleWatcher {
  /** Register a change handler; returns the subscription's disposable. */
  on_change(handler: () => void): Disposable;
  /** Register a create handler; returns the subscription's disposable. */
  on_create(handler: () => void): Disposable;
}

/** The `style_reload` cache-bust message posted to the webview — THEME-R-9. */
export interface StyleReloadMessage {
  type: 'style_reload';
  href: string;
}

export interface StyleWatchOps<U> {
  /**
   * Create a filesystem watcher for the given local file URI. MUST throw when
   * the target is unwatchable (e.g. outside the workspace on `vscode.dev`); the
   * throw is swallowed per THEME-R-9. The returned handle is disposed with the
   * rest of the subscription set.
   */
  create_watcher(local_uri: U): StyleWatcher & Disposable;
  /** Post the `style_reload` message to the webview. */
  post_message(message: StyleReloadMessage): void;
}

/**
 * Registers one watcher per resolved style (THEME-R-9). Both `on_change` and
 * `on_create` post `{type:'style_reload', href}`; a `create_watcher` failure is
 * swallowed so the remaining styles still watch. Returns a disposable releasing
 * every watcher and subscription.
 */
export function plan_style_watch<U>(
  resolved: readonly PlannedStyle<U>[],
  ops: StyleWatchOps<U>,
): Disposable {
  const subs: Disposable[] = [];
  for (const { href, local_uri } of resolved) {
    try {
      const watcher = ops.create_watcher(local_uri);
      const fire = () => ops.post_message({ type: 'style_reload', href });
      subs.push(watcher.on_change(fire));
      subs.push(watcher.on_create(fire));
      subs.push(watcher);
    } catch {
      // Web target may reject paths outside the workspace — manual-reload fallback.
    }
  }
  return {
    dispose: () => {
      for (const s of subs) s.dispose();
    },
  };
}
