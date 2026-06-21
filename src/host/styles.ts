import * as vscode from 'vscode';
import { classify_style_entry } from './styles_resolve.js';
import { create_logger } from '../log.js';

const log = create_logger('init');

// `plainmark.styles` user-customization channel — THEME-R-1.
// Locked v1 contract (THEME-R-2): file: URIs, absolute paths, and workspace-relative
// paths only; external `<link>` injection (never inline `<style>`); per-file
// `createFileSystemWatcher` for live reload via cache-bust message; config
// change triggers a full webview-html reload.

export interface ResolvedStyle {
  /** Webview-loadable URI string for `<link href>`. Stable across cache-busts. */
  href: string;
  /** Local-filesystem URI; used as the watcher target. */
  local_uri: vscode.Uri;
}

export interface StyleResolution {
  resolved: ResolvedStyle[];
  /** Directories to add to `localResourceRoots` so the webview can load each style. */
  resource_roots: vscode.Uri[];
  /** Operator-visible warnings — surfaced via `showWarningMessage`. */
  warnings: string[];
}

export function resolve_plainmark_styles(
  document_uri: vscode.Uri,
  webview: vscode.Webview,
): StyleResolution {
  const config = vscode.workspace.getConfiguration('plainmark', document_uri);
  const raw = config.get<unknown>('styles');
  if (!Array.isArray(raw)) return { resolved: [], resource_roots: [], warnings: [] };

  const resolved: ResolvedStyle[] = [];
  const resource_root_set = new Map<string, vscode.Uri>();
  const warnings: string[] = [];

  for (const entry of raw) {
    const classified = classify_style_entry(entry);
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

    let local_uri: vscode.Uri;
    try {
      if (classified.kind === 'file_uri') {
        local_uri = vscode.Uri.parse(classified.raw, true);
      } else if (classified.kind === 'absolute_path') {
        local_uri = vscode.Uri.file(classified.raw);
      } else {
        // relative_path — first workspace folder, fallback to document directory.
        const folder = vscode.workspace.workspaceFolders?.[0];
        const base = folder
          ? folder.uri
          : vscode.Uri.joinPath(document_uri, '..');
        local_uri = vscode.Uri.joinPath(base, classified.raw);
      }
    } catch {
      warnings.push(`plainmark.styles: failed to parse "${classified.raw}"`);
      continue;
    }

    const parent = vscode.Uri.joinPath(local_uri, '..');
    resource_root_set.set(parent.toString(), parent);
    resolved.push({
      href: webview.asWebviewUri(local_uri).toString(),
      local_uri,
    });
  }

  return {
    resolved,
    resource_roots: Array.from(resource_root_set.values()),
    warnings,
  };
}

function uri_basename(uri: vscode.Uri): string {
  const parts = uri.path.split('/').filter((p) => p.length > 0);
  return parts[parts.length - 1] ?? '';
}

export interface StyleWatchHandle {
  dispose(): void;
}

/**
 * Per-file `createFileSystemWatcher` for every resolved style. On `onDidChange`,
 * posts `{type: 'style_reload', href}` to the webview so it can cache-bust the
 * matching `<link>` query string while preserving CM6 cursor / selection state.
 * Returns a disposable that releases all watchers.
 *
 * Web-target caveat (THEME-R-9): `${userHome}` paths aren't watchable on
 * `vscode.dev`. We attempt the watcher unconditionally; failures are swallowed
 * (no operator-visible error — manual reload is the documented fallback).
 */
export function watch_styles(
  resolved: readonly ResolvedStyle[],
  webview: vscode.Webview,
): StyleWatchHandle {
  const subs: vscode.Disposable[] = [];
  for (const { href, local_uri } of resolved) {
    try {
      const parent = vscode.Uri.joinPath(local_uri, '..');
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(parent, uri_basename(local_uri)),
      );
      const fire = () => {
        log.debug('plainmark.styles reload', { href_len: href.length });
        void webview.postMessage({ type: 'style_reload', href });
      };
      subs.push(watcher.onDidChange(fire));
      subs.push(watcher.onDidCreate(fire));
      subs.push(watcher);
    } catch {
      // Web target may reject paths outside the workspace — fall back to manual reload.
    }
  }
  return {
    dispose: () => {
      for (const s of subs) s.dispose();
    },
  };
}
