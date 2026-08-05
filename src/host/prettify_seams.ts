import * as vscode from 'vscode';
import {
  resolve_prettify_seams,
  type SeamOverrideResolution,
} from '../common/prettify_seams_config.js';

// `plainmark.prettify.seams` host read. Resolution/validation is the pure
// `resolve_prettify_seams` (common, tier-a tested); this wrapper only supplies
// the vscode-config value, resource-scoped to the document. → PARA-I-8
export function read_prettify_seams(document_uri: vscode.Uri): SeamOverrideResolution {
  const config = vscode.workspace.getConfiguration('plainmark', document_uri);
  return resolve_prettify_seams(config.get<unknown>('prettify.seams'));
}
