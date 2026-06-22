import * as vscode from 'vscode';
import type { HostToWebviewMessage } from '../sync/protocol.js';
import {
  build_heading_tree,
  find_enclosing_heading,
  type HeadingNode,
  type RawSymbol,
} from './outline_model.js';

const OUTLINE_VIEW_ID = 'tutivog.plainmark.outline';
const SCROLL_TO_HEADING_COMMAND = 'tutivog.plainmark.scrollToHeading';

const TEXT_CHANGE_DEBOUNCE_MS = 200;

export interface OutlineDeps {
  view_type: string;
  get_panel_for_uri(uri: vscode.Uri): vscode.WebviewPanel | null;
  on_did_change_cursor: vscode.Event<{ uri: string; line: number }>;
}

class HeadingItem extends vscode.TreeItem {
  children: HeadingItem[] = [];
  parent: HeadingItem | null = null;

  constructor(
    readonly node: HeadingNode,
    readonly uri: vscode.Uri,
  ) {
    super(
      node.label,
      node.children.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    this.command = {
      command: SCROLL_TO_HEADING_COMMAND,
      title: 'Scroll to Heading',
      arguments: [uri, node.line, node.character],
    };
  }
}

// Stable item tree (one instance per node) so `TreeView.reveal` can resolve a
// node to the same object `getChildren` returns and walk `getParent` to it.
function build_items(
  roots: readonly HeadingNode[],
  uri: vscode.Uri,
  map: Map<HeadingNode, HeadingItem>,
  parent: HeadingItem | null,
): HeadingItem[] {
  return roots.map((node) => {
    const item = new HeadingItem(node, uri);
    item.parent = parent;
    map.set(node, item);
    item.children = build_items(node.children, uri, map, item);
    return item;
  });
}

class PlainmarkOutlineProvider implements vscode.TreeDataProvider<HeadingItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private active_uri: vscode.Uri | null = null;
  private roots: HeadingNode[] = [];
  private root_items: HeadingItem[] = [];
  private node_to_item = new Map<HeadingNode, HeadingItem>();
  private last_revealed: HeadingNode | null = null;
  private view: vscode.TreeView<HeadingItem> | null = null;

  set_view(view: vscode.TreeView<HeadingItem>): void {
    this.view = view;
  }

  get_active_uri(): vscode.Uri | null {
    return this.active_uri;
  }

  set_active_uri(uri: vscode.Uri | null): void {
    if ((this.active_uri?.toString() ?? null) === (uri?.toString() ?? null)) return;
    this.active_uri = uri;
    void this.refresh();
  }

  getTreeItem(element: HeadingItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HeadingItem): HeadingItem[] {
    return element ? element.children : this.root_items;
  }

  getParent(element: HeadingItem): HeadingItem | null {
    return element.parent;
  }

  private set_tree(roots: HeadingNode[]): void {
    this.roots = roots;
    this.node_to_item = new Map();
    this.root_items = build_items(roots, this.active_uri as vscode.Uri, this.node_to_item, null);
    this.last_revealed = null;
    this._onDidChangeTreeData.fire();
  }

  async refresh(): Promise<void> {
    const uri = this.active_uri;
    if (!uri) {
      this.set_tree([]);
      return;
    }
    // Lazy: a hidden view never renders, so skip the symbol query until it shows.
    if (this.view && !this.view.visible) return;
    this.set_tree(await query_headings(uri));
  }

  // OUT-I-3 — reveal and select the heading the caret currently sits under.
  async reveal_for_line(line: number): Promise<void> {
    if (!this.view || !this.view.visible) return;
    const node = find_enclosing_heading(this.roots, line);
    if (!node || node === this.last_revealed) return;
    const item = this.node_to_item.get(node);
    if (!item) return;
    this.last_revealed = node;
    try {
      // focus:false so following the caret never steals focus from the editor.
      await this.view.reveal(item, { select: true, focus: false });
    } catch {
      // reveal rejects if the view is mid-teardown — nothing actionable.
    }
  }
}

async function query_headings(uri: vscode.Uri): Promise<HeadingNode[]> {
  const symbols = await vscode.commands.executeCommand<RawSymbol[] | undefined>(
    'vscode.executeDocumentSymbolProvider',
    uri,
  );
  if (!symbols || symbols.length === 0) return [];
  return build_heading_tree(symbols);
}

export function register_outline(deps: OutlineDeps): vscode.Disposable {
  const provider = new PlainmarkOutlineProvider();
  const view = vscode.window.createTreeView(OUTLINE_VIEW_ID, { treeDataProvider: provider });
  provider.set_view(view);

  const sync_active = (): void => {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (input instanceof vscode.TabInputCustom && input.viewType === deps.view_type) {
      provider.set_active_uri(input.uri);
    } else {
      provider.set_active_uri(null);
    }
  };
  sync_active();

  const sub_tabs = vscode.window.tabGroups.onDidChangeTabs(sync_active);
  const sub_groups = vscode.window.tabGroups.onDidChangeTabGroups(sync_active);

  let debounce: ReturnType<typeof setTimeout> | undefined;
  const sub_doc = vscode.workspace.onDidChangeTextDocument((e) => {
    const uri = provider.get_active_uri();
    if (!uri || e.document.uri.toString() !== uri.toString()) return;
    if (!view.visible) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void provider.refresh(), TEXT_CHANGE_DEBOUNCE_MS);
  });

  const sub_vis = view.onDidChangeVisibility((e) => {
    if (e.visible) void provider.refresh();
  });

  const sub_cursor = deps.on_did_change_cursor((e) => {
    const uri = provider.get_active_uri();
    if (!uri || e.uri !== uri.toString()) return;
    void provider.reveal_for_line(e.line);
  });

  const cmd = vscode.commands.registerCommand(
    SCROLL_TO_HEADING_COMMAND,
    (uri: vscode.Uri, line: number, character: number) => {
      const panel = deps.get_panel_for_uri(uri);
      void panel?.webview.postMessage({
        type: 'scroll_to_heading',
        line,
        character,
      } satisfies HostToWebviewMessage);
    },
  );

  return vscode.Disposable.from(view, sub_tabs, sub_groups, sub_doc, sub_vis, sub_cursor, cmd, {
    dispose: () => {
      if (debounce) clearTimeout(debounce);
    },
  });
}
