// VS Code Desktop host smoke.
//
// Runs inside the extension host process via @vscode/test-electron; the
// `vscode` import is the live VS Code API. Three assertions:
//
//   (a) `vscode.openWith` → `doc.isDirty === false`
//   (b) external `workspace.applyEdit` → `doc.isDirty === true` and
//        `doc.getText()` equals the expected markdown
//   (c) workbench `undo` command → `doc.getText()` matches pre-edit
//
// "External `applyEdit`" stands in for a webview-originated edit; the host
// has no API to drive the webview iframe, and an applyEdit from the test
// side is what the webview's sync layer effectively produces from the host's
// perspective.

import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const SEED_MD = '# Heading\n\nFirst paragraph.\n\nSecond paragraph.\n';
const INSERT = 'X';

async function with_temp_file<T>(fn: (uri: vscode.Uri) => Promise<T>): Promise<T> {
  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'plainmark-smoke-'));
  const file = path.join(tmpdir, 'doc.md');
  await fs.writeFile(file, SEED_MD, 'utf8');
  const uri = vscode.Uri.file(file);
  try {
    return await fn(uri);
  } finally {
    try {
      await fs.rm(tmpdir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

async function open_in_plainmark(uri: vscode.Uri): Promise<vscode.TextDocument> {
  await vscode.commands.executeCommand('vscode.openWith', uri, 'tutivog.plainmark');
  // The webview boots asynchronously; allow a short settle so the custom
  // editor's resolveCustomTextEditor has time to run before assertions.
  await new Promise((r) => setTimeout(r, 500));
  return vscode.workspace.openTextDocument(uri);
}

suite('Plainmark host smoke SYNC-P-2 SYNC-H-6 SHELL-A-8', () => {
  test('(a) vscode.openWith → doc.isDirty === false', async () => {
    await with_temp_file(async (uri) => {
      const doc = await open_in_plainmark(uri);
      assert.strictEqual(doc.isDirty, false, 'document should not be dirty after openWith');
      assert.strictEqual(doc.getText(), SEED_MD, 'document text should match the on-disk seed');
    });
  });

  test('(b) external applyEdit → isDirty=true + getText() matches', async () => {
    await with_temp_file(async (uri) => {
      const doc = await open_in_plainmark(uri);
      const edit = new vscode.WorkspaceEdit();
      const insert_at = SEED_MD.indexOf('First paragraph.') + 'First paragraph.'.length;
      const pos = doc.positionAt(insert_at);
      edit.insert(uri, pos, INSERT);
      const applied = await vscode.workspace.applyEdit(edit);
      assert.strictEqual(applied, true, 'applyEdit returned false');
      assert.strictEqual(doc.isDirty, true, 'document should be dirty after the edit');
      const expected =
        SEED_MD.slice(0, insert_at) + INSERT + SEED_MD.slice(insert_at);
      assert.strictEqual(doc.getText(), expected, 'document text should reflect the edit');
    });
  });

  test('(c) workbench undo while Plainmark active is a no-op (INV-UNDO-2)', async () => {
    // CustomTextEditorProvider does not expose an undo provider — only
    // CustomEditorProvider (with CustomDocument) has undoEdits/redoEdits.
    // The webview's CM6 history owns undo; the host's workbench `undo`
    // command, with Plainmark as the active editor, can't reach into the
    // webview iframe and therefore silently does nothing to the underlying
    // TextDocument. T18 / INV-UNDO-2 already muzzle the Ctrl+Z keybinding for
    // exactly this reason; this assertion pins the behavior at the
    // command-API tier too — a regression here would mean a future VS Code
    // release started routing built-in undo into the TextDocument's stack
    // for active custom text editors, which would silently fight the
    // webview's CM6 history.
    await with_temp_file(async (uri) => {
      const doc = await open_in_plainmark(uri);
      const before = doc.getText();
      const edit = new vscode.WorkspaceEdit();
      const insert_at = SEED_MD.indexOf('First paragraph.') + 'First paragraph.'.length;
      edit.insert(uri, doc.positionAt(insert_at), INSERT);
      await vscode.workspace.applyEdit(edit);
      const post_edit = doc.getText();
      assert.notStrictEqual(post_edit, before, 'applyEdit was a no-op');
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(
        doc.getText(),
        post_edit,
        'workbench undo unexpectedly reverted bytes — the INV-UNDO-2 muzzle contract is broken',
      );
    });
  });
});
