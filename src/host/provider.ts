import * as vscode from 'vscode';
import {
  create_sync_loop,
  type CursorPosition,
  type SyncEditApplier,
} from '../sync/loop.js';
import type {
  HostToWebviewMessage,
  HostPasteImageReplyMessage,
  WebviewPasteImageMessage,
  WebviewToHostMessage,
} from '../sync/protocol.js';
import { lf_to_native, native_to_lf } from '../sync/translate.js';
import { ROOT_DEFAULTS_CSS } from '../theme/root_defaults.js';
import { normalize_theme_id, theme_css_for } from '../theme/themes.js';
import {
  resolve_plainmark_styles,
  watch_styles,
  type ResolvedStyle,
  type StyleWatchHandle,
} from './styles.js';
import { read_table_keybindings } from './table_keybindings.js';
import type { ResolvedTableKeybindings } from '../common/table_keybindings.js';
import { register_outline } from './outline.js';
import {
  dedupe_file_name,
  document_base_name,
  image_file_name,
  plan_save_dir,
  relative_path,
} from './image_paste.js';
import { create_logger } from '../log.js';

const sync_log = create_logger('sync');
const init_log = create_logger('init');
const widget_log = create_logger('widget');

export class PlainmarkEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'tutivog.plainmark';

  private static active_panels = new Set<vscode.WebviewPanel>();
  private static last_active_panel: vscode.WebviewPanel | null = null;
  // Per-panel document map — `openInTextEditor` needs the document URI for the
  // panel that fired the title-bar button (no document arg from the button).
  private static panel_documents = new WeakMap<vscode.WebviewPanel, vscode.TextDocument>();
  // Most-recent cursor reported by each Plainmark webview, fed by the
  // sync loop's on_cursor_changed hook. Read by `openInTextEditor` to seed the
  // text editor's selection. Map (strong refs) because we look up by panel
  // identity from the active-panel resolver, not the panel object's lifetime.
  private static panel_cursors = new Map<vscode.WebviewPanel, CursorPosition>();
  // Pending caret to seed a Plainmark webview on its first sync after
  // a text-editor → Plainmark toggle. Keyed by `uri.toString()` so the cursor
  // survives the brief window between `openWith` and the new webview's `ready`.
  private static pending_initial_cursor = new Map<string, CursorPosition>();
  // Fan-out of webview caret reports so the outline view can follow the caret
  // without coupling to the sync loop. Carries the document URI + caret line.
  private static readonly _on_did_change_cursor = new vscode.EventEmitter<{
    uri: string;
    line: number;
  }>();
  static readonly on_did_change_cursor = PlainmarkEditorProvider._on_did_change_cursor.event;

  static get_active_panel(): vscode.WebviewPanel | null {
    if (
      PlainmarkEditorProvider.last_active_panel &&
      PlainmarkEditorProvider.last_active_panel.active &&
      PlainmarkEditorProvider.last_active_panel.visible
    ) {
      return PlainmarkEditorProvider.last_active_panel;
    }
    for (const panel of PlainmarkEditorProvider.active_panels) {
      if (panel.active && panel.visible) return panel;
    }
    return null;
  }

  static get_panel_for_uri(uri: vscode.Uri): vscode.WebviewPanel | null {
    const uri_string = uri.toString();
    for (const panel of PlainmarkEditorProvider.active_panels) {
      if (
        PlainmarkEditorProvider.panel_documents.get(panel)?.uri.toString() === uri_string
      ) {
        return panel;
      }
    }
    return null;
  }

  private static set_editor_active_context(active: boolean): void {
    void vscode.commands.executeCommand(
      'setContext',
      'tutivog.plainmark.editorIsActive',
      active,
    );
  }

  private static refresh_editor_active_context(): void {
    let any_active = false;
    for (const panel of PlainmarkEditorProvider.active_panels) {
      if (panel.active) {
        any_active = true;
        break;
      }
    }
    PlainmarkEditorProvider.set_editor_active_context(any_active);
  }

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const editor = vscode.window.registerCustomEditorProvider(
      PlainmarkEditorProvider.viewType,
      new PlainmarkEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } },
    );
    // Muzzle workbench Undo/Redo while our editor is active; without this both
    // CM6 (in the webview) and the workbench undo handler fire on the same
    // Ctrl+Z and race our applyEdit. Log markers:
    // if a user reports undo corruption, these logs prove whether the muzzle
    // intercepted the workbench path or it slipped through (e.g. the macOS
    // double-dispatch in vscode#241801).
    const noop_undo = vscode.commands.registerCommand('tutivog.plainmark.noop_undo', () => {
      sync_log.debug('noop_undo fired');
    });
    const noop_redo = vscode.commands.registerCommand('tutivog.plainmark.noop_redo', () => {
      sync_log.debug('noop_redo fired');
    });
    // Muzzle Ctrl/Cmd+F so the workbench doesn't act on it while CM6's in-webview
    // search owns find; same pattern as the Undo/Redo muzzle above.
    const noop_find = vscode.commands.registerCommand('tutivog.plainmark.noop_find', () => {
      sync_log.debug('noop_find fired');
    });
    const insert_table = vscode.commands.registerCommand(
      'tutivog.plainmark.insertTable',
      () => {
        const panel = PlainmarkEditorProvider.get_active_panel();
        void panel?.webview.postMessage({ type: 'insert_table' } satisfies HostToWebviewMessage);
      },
    );
    const insert_footnote = vscode.commands.registerCommand(
      'tutivog.plainmark.insertFootnote',
      () => {
        const panel = PlainmarkEditorProvider.get_active_panel();
        void panel?.webview.postMessage({ type: 'insert_footnote' } satisfies HostToWebviewMessage);
      },
    );
    // `vscode.openWith` with viewId `'default'` is the
    // documented way to switch a custom-editor tab back to VS Code's built-in
    // text editor. Plain
    // openWith does NOT close the source tab when both editors can hold the
    // same TextDocument — both tabs persist in the column. We open the
    // destination first (so the document keeps a live view, no dirty-state
    // save prompt) then close the source tab via the Tab API.
    const open_in_text_editor = vscode.commands.registerCommand(
      'tutivog.plainmark.openInTextEditor',
      async (uri?: vscode.Uri) => {
        const panel = PlainmarkEditorProvider.get_active_panel();
        const target_uri =
          uri ??
          (panel
            ? PlainmarkEditorProvider.panel_documents.get(panel)?.uri
            : undefined);
        if (!target_uri) {
          init_log.warn('openInTextEditor: no target uri');
          return;
        }
        const source_tab = find_tab_for(
          target_uri,
          PlainmarkEditorProvider.viewType,
        );
        // Replay the webview's last reported caret on the text editor.
        const cached_cursor = panel
          ? PlainmarkEditorProvider.panel_cursors.get(panel)
          : undefined;
        const show_options: vscode.TextDocumentShowOptions = {
          viewColumn: source_tab?.group.viewColumn ?? panel?.viewColumn,
        };
        if (cached_cursor) {
          const pos = new vscode.Position(cached_cursor.line, cached_cursor.character);
          show_options.selection = new vscode.Range(pos, pos);
        }
        await vscode.commands.executeCommand(
          'vscode.openWith',
          target_uri,
          'default',
          show_options,
        );
        if (source_tab) {
          await vscode.window.tabGroups.close(source_tab);
        }
      },
    );
    const open_in_plainmark = vscode.commands.registerCommand(
      'tutivog.plainmark.openInPlainmark',
      async (uri?: vscode.Uri) => {
        const text_editor = vscode.window.activeTextEditor;
        const editor_target = uri ?? text_editor?.document.uri;
        if (!editor_target) {
          init_log.warn('openInPlainmark: no target uri');
          return;
        }
        // Stash the text editor's caret; the next sync the new
        // Plainmark webview receives will fold it into `initial_cursor` via
        // the loop's consume_initial_cursor hook.
        const editor_for_target =
          text_editor && text_editor.document.uri.toString() === editor_target.toString()
            ? text_editor
            : vscode.window.visibleTextEditors.find(
                (e) => e.document.uri.toString() === editor_target.toString(),
              );
        // openWith on a uri with a live Plainmark panel only REVEALS it — no
        // resolve, no ready handshake, so nothing would consume the stash and
        // an arbitrary later sync would replay it as a caret jump + focus steal.
        const will_resolve_new_panel =
          PlainmarkEditorProvider.get_panel_for_uri(editor_target) === null;
        if (editor_for_target && will_resolve_new_panel) {
          const active = editor_for_target.selection.active;
          PlainmarkEditorProvider.pending_initial_cursor.set(editor_target.toString(), {
            line: active.line,
            character: active.character,
          });
        }
        const source_tab = find_tab_for(editor_target, 'default');
        await vscode.commands.executeCommand(
          'vscode.openWith',
          editor_target,
          PlainmarkEditorProvider.viewType,
          source_tab?.group.viewColumn ?? text_editor?.viewColumn,
        );
        if (source_tab) {
          await vscode.window.tabGroups.close(source_tab);
        }
      },
    );
    const select_theme = vscode.commands.registerCommand(
      'tutivog.plainmark.selectTheme',
      async () => {
        const config = vscode.workspace.getConfiguration('plainmark');
        const current = config.get<string>('theme', 'default');
        const items: (vscode.QuickPickItem & { value: string })[] = [
          { label: 'Default', detail: 'Adapts to the VS Code color theme', value: 'default' },
          { label: 'GitHub Light', value: 'github-light' },
          { label: 'GitHub Dark', value: 'github-dark' },
          {
            label: 'Claudify',
            detail: 'Anthropic-inspired warm cream and terracotta palette',
            value: 'claudify',
          },
        ];
        for (const item of items) {
          if (item.value === current) item.description = 'current';
        }
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select Plainmark theme',
        });
        if (!picked) return;
        await config.update('theme', picked.value, vscode.ConfigurationTarget.Global);
      },
    );
    const outline = register_outline({
      view_type: PlainmarkEditorProvider.viewType,
      get_panel_for_uri: (uri) => PlainmarkEditorProvider.get_panel_for_uri(uri),
      on_did_change_cursor: PlainmarkEditorProvider.on_did_change_cursor,
    });
    return vscode.Disposable.from(
      editor,
      noop_undo,
      noop_redo,
      noop_find,
      insert_table,
      insert_footnote,
      open_in_text_editor,
      open_in_plainmark,
      select_theme,
      outline,
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): void {
    const document_dir_uri = compute_document_dir_uri(document.uri);
    // Whitelist the document's workspace folder too, so images saved outside the document dir (e.g. via plainmark.imagePasteLocation) still load in the webview (IMG-I-3).
    const workspace_folder_uri = vscode.workspace.getWorkspaceFolder(document.uri)?.uri ?? null;
    // Default `localResourceRoots` is `[extensionUri]`. Overriding it without
    // including the extension dir would 401-block `dist/webview.js` itself.
    const dist_uri = vscode.Uri.joinPath(this.context.extensionUri, 'dist');

    // Style watch handle is recreated on `plainmark.styles` config change
    // (full webview reload — THEME-R-8). Stored in a closure
    // so the disposer can release the prior set before installing a new one.
    let style_watch: StyleWatchHandle | null = null;
    const install_styles = (): ResolvedStyle[] => {
      style_watch?.dispose();
      const { resolved, resource_roots, warnings } = resolve_plainmark_styles(
        document.uri,
        webviewPanel.webview,
      );
      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          dist_uri,
          ...(document_dir_uri ? [document_dir_uri] : []),
          ...(workspace_folder_uri ? [workspace_folder_uri] : []),
          ...resource_roots,
        ],
      };
      for (const warning of warnings) {
        void vscode.window.showWarningMessage(warning);
      }
      style_watch = watch_styles(resolved, webviewPanel.webview);
      return resolved;
    };

    const compute_keybindings = (): ResolvedTableKeybindings => {
      const { resolved, warnings } = read_table_keybindings(document.uri);
      for (const warning of warnings) init_log.warn(warning);
      return resolved;
    };

    const initial_styles = install_styles();
    const initial_keybindings = compute_keybindings();
    webviewPanel.webview.html = this.getHtml(
      webviewPanel.webview,
      initial_styles,
      initial_keybindings,
    );

    const document_dir_webview_uri = document_dir_uri
      ? webviewPanel.webview.asWebviewUri(document_dir_uri).toString()
      : null;
    const document_dir_webview_uri_base = document_dir_webview_uri
      ? document_dir_webview_uri.endsWith('/')
        ? document_dir_webview_uri
        : `${document_dir_webview_uri}/`
      : null;

    const get_eol = (): '\r\n' | '\n' =>
      document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';

    const applier: SyncEditApplier = {
      async apply_full_replace(uri_string: string, lf_text: string): Promise<boolean> {
        if (uri_string !== document.uri.toString()) return false;
        const eol = get_eol();
        const native_text = lf_to_native(lf_text, eol);
        const we = new vscode.WorkspaceEdit();
        we.replace(
          document.uri,
          new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
          ),
          native_text,
        );
        return await vscode.workspace.applyEdit(we);
      },
    };

    // whole-doc sync reads the text several times per keystroke — cache the LF copy per document version
    let lf_text_cache: { version: number; text: string } | null = null;
    const get_lf_text = (): string => {
      if (lf_text_cache?.version !== document.version) {
        lf_text_cache = { version: document.version, text: native_to_lf(document.getText()) };
      }
      return lf_text_cache.text;
    };

    const loop = create_sync_loop(
      {
        uri_string: document.uri.toString(),
        get_text: get_lf_text,
        get_version: () => document.version,
        get_document_dir_webview_uri: () => document_dir_webview_uri_base,
      },
      { post_message: (m) => void webviewPanel.webview.postMessage(m) },
      applier,
      {
        on_cursor_changed: (pos) => {
          PlainmarkEditorProvider.panel_cursors.set(webviewPanel, pos);
          PlainmarkEditorProvider._on_did_change_cursor.fire({
            uri: document.uri.toString(),
            line: pos.line,
          });
        },
        consume_initial_cursor: () => {
          const key = document.uri.toString();
          const pos = PlainmarkEditorProvider.pending_initial_cursor.get(key) ?? null;
          if (pos) PlainmarkEditorProvider.pending_initial_cursor.delete(key);
          return pos;
        },
      },
    );

    const sub_msg = webviewPanel.webview.onDidReceiveMessage((raw) => {
      const message = parse_webview_message(raw);
      // IPC-boundary trace gated to non-`update` messages — `update` already
      // logs per-message inside loop.ts and fires on every keystroke. This
      // line catches `ready`, `link_click`, and any future sideband types so
      // future "host silent" triage distinguishes IPC drop from internal
      // short-circuit without code edits.
      if (message?.type !== 'update') {
        sync_log.debug('onDidReceiveMessage', { type: message?.type ?? '<non-string>' });
      }
      if (try_handle_link_click(message, document.uri)) return;
      if (try_handle_style_load_error(message)) return;
      if (try_handle_table_edit_error(message)) return;
      if (message?.type === 'paste_image') {
        void handle_paste_image(message, document, webviewPanel.webview);
        return;
      }
      void loop.handle_webview_message(raw);
    });

    const sub_config = vscode.workspace.onDidChangeConfiguration((e) => {
      const styles_changed = e.affectsConfiguration('plainmark.styles', document.uri);
      const keys_changed = e.affectsConfiguration('plainmark.tableKeybindings', document.uri);
      const theme_changed = e.affectsConfiguration('plainmark.theme');
      if (!styles_changed && !keys_changed && !theme_changed) return;
      init_log.debug('plainmark configuration changed — reloading webview', {
        styles_changed,
        keys_changed,
        theme_changed,
      });
      const next_styles = install_styles();
      const next_keybindings = compute_keybindings();
      // Full webview-html reload per THEME-R-8: re-setting `webview.html` reboots
      // the webview process; CM6 state is rebuilt via the `ready` handshake.
      webviewPanel.webview.html = this.getHtml(
        webviewPanel.webview,
        next_styles,
        next_keybindings,
      );
    });

    const sub_change = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      loop.handle_text_document_change(document.uri.toString());
    });

    PlainmarkEditorProvider.active_panels.add(webviewPanel);
    PlainmarkEditorProvider.panel_documents.set(webviewPanel, document);
    if (webviewPanel.active) PlainmarkEditorProvider.last_active_panel = webviewPanel;
    PlainmarkEditorProvider.refresh_editor_active_context();
    const sub_view_state = webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) {
        PlainmarkEditorProvider.last_active_panel = e.webviewPanel;
      }
      PlainmarkEditorProvider.refresh_editor_active_context();
    });

    webviewPanel.onDidDispose(() => {
      sub_msg.dispose();
      sub_change.dispose();
      sub_view_state.dispose();
      sub_config.dispose();
      style_watch?.dispose();
      PlainmarkEditorProvider.active_panels.delete(webviewPanel);
      PlainmarkEditorProvider.panel_documents.delete(webviewPanel);
      PlainmarkEditorProvider.panel_cursors.delete(webviewPanel);
      if (PlainmarkEditorProvider.last_active_panel === webviewPanel) {
        PlainmarkEditorProvider.last_active_panel = null;
      }
      PlainmarkEditorProvider.refresh_editor_active_context();
    });
  }

  private getHtml(
    webview: vscode.Webview,
    styles: readonly ResolvedStyle[],
    keybindings: ResolvedTableKeybindings,
  ): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
    );
    const mathjaxUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'mathjax.js'),
    );
    const mermaidUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'mermaid.js'),
    );
    const fontsBase = `${webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'fonts'))
      .toString()}/`;
    // `style-src` widens to include `${webview.cspSource}` so user `<link>` tags load — THEME-R-7.
    const csp = [
      `default-src 'none'`,
      `style-src 'unsafe-inline' ${webview.cspSource}`,
      `img-src ${webview.cspSource} https:`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    // Theme block sits between root defaults and user links — cascade contract: root defaults → active theme → user styles.
    const theme_id = normalize_theme_id(
      vscode.workspace.getConfiguration('plainmark').get('theme'),
    );
    const theme_css = theme_css_for(theme_id);
    const theme_style = theme_css ? `<style nonce="${nonce}">${theme_css}</style>` : '';
    // User `<link>` tags follow the `:root` defaults `<style>` so user values win — THEME-R-6 cascade order.
    const user_links = styles
      .map(
        ({ href }) =>
          `<link rel="stylesheet" href="${escape_attribute(href)}" data-plainmark-style="${escape_attribute(href)}">`,
      )
      .join('\n  ');
    // `<style>` precedes script tags so CM6's style-mod insertion stays lower-precedence than our `:root` defaults.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plainmark</title>
  <style nonce="${nonce}">${ROOT_DEFAULTS_CSS}</style>
  ${theme_style}
  ${user_links}
</head>
<body>
  <div id="editor"></div>
  <script nonce="${nonce}">window.__mathjax_font_url = ${JSON.stringify(fontsBase)};</script>
  <script nonce="${nonce}">window.__plainmark_mathjax = ${JSON.stringify({ url: mathjaxUri.toString(), nonce })};</script>
  <script nonce="${nonce}">window.__plainmark_mermaid = ${JSON.stringify({ url: mermaidUri.toString(), nonce })};</script>
  <script nonce="${nonce}">window.__plainmark_theme = ${JSON.stringify(theme_id)};</script>
  <script nonce="${nonce}">window.__plainmark_table_keybindings = ${
    // user-settable strings can contain "</script>", which would terminate the inline script
    JSON.stringify(keybindings).replace(/</g, '\\u003c')
  };</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  // globalThis.crypto (Web Crypto) works in both Node 22 and browser — no Node import needed
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function escape_attribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

// Narrow an untrusted IPC payload to the shared wire union at the host boundary;
// a string `type` discriminant is the only structural guarantee we assert here.
function parse_webview_message(raw: unknown): WebviewToHostMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof (raw as { type?: unknown }).type !== 'string') return null;
  return raw as WebviewToHostMessage;
}

function try_handle_style_load_error(msg: WebviewToHostMessage | null): boolean {
  if (msg?.type !== 'style_load_error') return false;
  const href = typeof msg.href === 'string' ? msg.href : '<unknown>';
  init_log.warn('plainmark.styles load failed', { href_len: href.length });
  void vscode.window.showWarningMessage(`Plainmark: failed to load style ${href}`);
  return true;
}

function try_handle_table_edit_error(msg: WebviewToHostMessage | null): boolean {
  if (msg?.type !== 'table_edit_error') return false;
  const reason = typeof msg.reason === 'string' ? msg.reason : '<unknown>';
  widget_log.error('table edit failed', { reason });
  void vscode.window.showErrorMessage(
    `Plainmark: a table edit could not be applied and was discarded (${reason})`,
  );
  return true;
}

// `atob` is a global in both the Node and web extension hosts — avoids Node `Buffer` (INV-HOST-1).
function decode_base64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function read_dir_names(dir: vscode.Uri): Promise<Set<string>> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(dir);
    return new Set(entries.map(([name]) => name));
  } catch {
    return new Set();
  }
}

async function handle_paste_image(
  msg: WebviewPasteImageMessage,
  document: vscode.TextDocument,
  webview: vscode.Webview,
): Promise<void> {
  const reply = (m: HostPasteImageReplyMessage): void => void webview.postMessage(m);

  if (typeof msg.data !== 'string' || msg.data.length === 0 || typeof msg.mime !== 'string') {
    reply({ type: 'paste_image_reply', error: 'invalid paste payload' });
    return;
  }

  const doc_dir = compute_document_dir_uri(document.uri);
  if (!doc_dir || vscode.workspace.fs.isWritableFileSystem(document.uri.scheme) === false) {
    const warning = 'Plainmark: save this document to a folder before pasting images.';
    widget_log.warn('paste_image: no writable filesystem', { scheme: document.uri.scheme });
    void vscode.window.showWarningMessage(warning);
    reply({ type: 'paste_image_reply', error: warning });
    return;
  }

  const template =
    vscode.workspace
      .getConfiguration('plainmark', document.uri)
      .get<string>('imagePasteLocation') ?? '.';
  const plan = plan_save_dir(template, document_base_name(document.uri.path));
  const ws_folder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri ?? null;
  const base_uri = plan.base === 'workspace' ? (ws_folder ?? doc_dir) : doc_dir;
  const save_dir = plan.relative
    ? vscode.Uri.joinPath(base_uri, ...plan.relative.split('/'))
    : base_uri;

  try {
    const bytes = decode_base64(msg.data);
    await vscode.workspace.fs.createDirectory(save_dir);
    const name = dedupe_file_name(image_file_name(new Date(), msg.mime), await read_dir_names(save_dir));
    const file_uri = vscode.Uri.joinPath(save_dir, name);
    await vscode.workspace.fs.writeFile(file_uri, bytes);
    const rel = relative_path(doc_dir.path, file_uri.path);
    widget_log.debug('paste_image: saved', { bytes: bytes.length, rel_len: rel.length });
    reply({ type: 'paste_image_reply', relative_path: rel });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    widget_log.error('paste_image: save failed', { detail });
    void vscode.window.showWarningMessage(`Plainmark: could not save the pasted image (${detail}).`);
    reply({ type: 'paste_image_reply', error: detail });
  }
}

// Locate the tab holding `uri` opened with `viewType` — `'default'` matches the
// built-in text editor (TabInputText), any other string matches a custom
// editor (TabInputCustom) with that viewType. Returns the first match in
// active-group-first order so the toggle prefers the tab the user is on.
function find_tab_for(uri: vscode.Uri, viewType: string): vscode.Tab | null {
  const uri_string = uri.toString();
  const groups = [
    vscode.window.tabGroups.activeTabGroup,
    ...vscode.window.tabGroups.all.filter(
      (g) => g !== vscode.window.tabGroups.activeTabGroup,
    ),
  ];
  for (const group of groups) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (viewType === 'default') {
        if (
          input instanceof vscode.TabInputText &&
          input.uri.toString() === uri_string
        ) {
          return tab;
        }
      } else if (
        input instanceof vscode.TabInputCustom &&
        input.viewType === viewType &&
        input.uri.toString() === uri_string
      ) {
        return tab;
      }
    }
  }
  return null;
}

function compute_document_dir_uri(doc_uri: vscode.Uri): vscode.Uri | null {
  // Schemes without a meaningful parent directory (e.g. `untitled:`) cannot host
  // relative-path images; webview returns null so the widget skips rendering them.
  if (doc_uri.scheme === 'untitled') return null;
  return vscode.Uri.joinPath(doc_uri, '..');
}

// Matches any RFC-3986 scheme — non-scheme hrefs are treated as document-relative.
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function try_handle_link_click(msg: WebviewToHostMessage | null, doc_uri: vscode.Uri): boolean {
  if (msg?.type !== 'link_click') return false;
  if (typeof msg.href !== 'string' || msg.href.length === 0) {
    widget_log.debug('link_click ipc: empty href');
    return true;
  }
  const href = msg.href;
  if (href.startsWith('#')) {
    widget_log.debug('link_click ipc: bare fragment ignored');
    return true;
  }
  if (SCHEME_RE.test(href)) {
    widget_log.debug('link_click ipc: openExternal', { href_len: href.length });
    try {
      void vscode.env.openExternal(vscode.Uri.parse(href));
    } catch {
      // Malformed URI — swallow; nothing actionable to surface yet.
    }
    return true;
  }
  const dir = compute_document_dir_uri(doc_uri);
  if (!dir) {
    widget_log.debug('link_click ipc: relative but no document dir (untitled)');
    return true;
  }
  try {
    const target = vscode.Uri.joinPath(dir, href);
    widget_log.debug('link_click ipc: vscode.open', { href_len: href.length });
    void vscode.commands.executeCommand('vscode.open', target);
  } catch {
    // Bad relative path — swallow.
  }
  return true;
}
