import * as vscode from 'vscode';
import {
  resolve_table_keybindings,
  type TableKeybindingResolution,
} from '../common/table_keybindings.js';

// `plainmark.tableKeybindings` host read. Resolution/validation is the pure
// `resolve_table_keybindings` (common, tier-a tested); this wrapper only supplies
// the vscode-config value, resource-scoped to the document. → TBL-I-28
export function read_table_keybindings(
  document_uri: vscode.Uri,
): TableKeybindingResolution {
  const config = vscode.workspace.getConfiguration('plainmark', document_uri);
  return resolve_table_keybindings(config.get<unknown>('tableKeybindings'));
}
