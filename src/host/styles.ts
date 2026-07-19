import * as vscode from 'vscode';
import {
  plan_plainmark_styles,
  plan_style_watch,
  type Disposable,
  type PlannedStyle,
  type StyleBases,
  type StylePlan,
  type StyleReloadMessage,
  type StyleUriOps,
  type StyleWatcher,
  type StyleWatchOps,
} from './styles_plan.js';
import { create_logger } from '../log.js';

const log = create_logger('init');

// `plainmark.styles` user-customization channel — THEME-R-1.
// Locked v1 contract (THEME-R-2): file: URIs, absolute paths, and workspace-relative
// paths only; external `<link>` injection (never inline `<style>`); per-file
// `createFileSystemWatcher` for live reload via cache-bust message; config
// change triggers a full webview-html reload.
//
// The resolution/watch decisions (which base each entry resolves against, warning
// aggregation, resource-root dedup, watcher wiring) live in the vscode-free
// styles_plan.ts so vitest can exercise them. This file supplies the vscode URI
// arithmetic behind the facade the planner consumes.

export type ResolvedStyle = PlannedStyle<vscode.Uri>;

export type StyleResolution = StylePlan<vscode.Uri>;

export function resolve_plainmark_styles(
  document_uri: vscode.Uri,
  webview: vscode.Webview,
): StyleResolution {
  const config = vscode.workspace.getConfiguration('plainmark', document_uri);
  const raw = config.get<unknown>('styles');
  const folder = vscode.workspace.workspaceFolders?.[0];

  const bases: StyleBases<vscode.Uri> = {
    workspace_folder: folder ? folder.uri : null,
    document_dir: () => vscode.Uri.joinPath(document_uri, '..'),
  };
  const ops: StyleUriOps<vscode.Uri> = {
    parse_file_uri: (raw_uri) => vscode.Uri.parse(raw_uri, true),
    from_absolute_path: (path) => vscode.Uri.file(path),
    join: (base, relative) => vscode.Uri.joinPath(base, relative),
    parent: (uri) => vscode.Uri.joinPath(uri, '..'),
    to_string: (uri) => uri.toString(),
    to_webview_href: (uri) => webview.asWebviewUri(uri).toString(),
  };

  return plan_plainmark_styles(raw, bases, ops);
}

function uri_basename(uri: vscode.Uri): string {
  const parts = uri.path.split('/').filter((p) => p.length > 0);
  return parts[parts.length - 1] ?? '';
}

export type StyleWatchHandle = Disposable;

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
  const ops: StyleWatchOps<vscode.Uri> = {
    create_watcher: (local_uri) => {
      const parent = vscode.Uri.joinPath(local_uri, '..');
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(parent, uri_basename(local_uri)),
      );
      return {
        on_change: (handler) => watcher.onDidChange(handler),
        on_create: (handler) => watcher.onDidCreate(handler),
        dispose: () => watcher.dispose(),
      } satisfies StyleWatcher & Disposable;
    },
    post_message: (message: StyleReloadMessage) => {
      log.debug('plainmark.styles reload', { href_len: message.href.length });
      void webview.postMessage(message);
    },
  };
  return plan_style_watch(resolved, ops);
}
