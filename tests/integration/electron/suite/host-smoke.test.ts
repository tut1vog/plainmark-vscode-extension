// VS Code Desktop host smoke.
//
// Runs inside the extension host process via @vscode/test-electron; the
// `vscode` import is the live VS Code API. Three assertions:
//
//   (a) `vscode.openWith` → `doc.isDirty === false`
//   (b) external `workspace.applyEdit` → `doc.isDirty === true` and
//        `doc.getText()` equals the expected markdown
//   (c) the INV-UNDO-2 muzzle wiring: `noop_undo` registered and inert,
//        Ctrl+Z keybinding contribution present in the loaded manifest
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

  test('(c) undo muzzle wiring: noop_undo inert + Ctrl+Z keybinding present (INV-UNDO-2)', async () => {
    // The muzzle is keybinding-level: Ctrl+Z → noop_undo while Plainmark is
    // active. Where a direct `executeCommand('undo')` lands is focus-dependent
    // and workbench-owned, so pin the wiring the extension controls instead.
    await with_temp_file(async (uri) => {
      const doc = await open_in_plainmark(uri);
      const edit = new vscode.WorkspaceEdit();
      const insert_at = SEED_MD.indexOf('First paragraph.') + 'First paragraph.'.length;
      edit.insert(uri, doc.positionAt(insert_at), INSERT);
      await vscode.workspace.applyEdit(edit);
      const post_edit = doc.getText();

      await vscode.commands.executeCommand('tutivog.plainmark.noop_undo');
      assert.strictEqual(doc.getText(), post_edit, 'noop_undo must not touch document bytes');
      assert.strictEqual(doc.isDirty, true, 'noop_undo must not change dirty state');

      const ext = vscode.extensions.getExtension('tutivog.plainmark');
      assert.ok(ext, 'extension tutivog.plainmark not found in the loaded host');
      const manifest = ext.packageJSON as {
        contributes?: { keybindings?: Array<{ command: string; key: string; when?: string }> };
      };
      const keybindings = manifest.contributes?.keybindings ?? [];
      const undo_binding = keybindings.find(
        (kb) => kb.command === 'tutivog.plainmark.noop_undo' && kb.key === 'ctrl+z',
      );
      assert.ok(undo_binding, 'ctrl+z → noop_undo keybinding missing from loaded manifest');
      assert.strictEqual(
        undo_binding.when,
        "activeCustomEditorId == 'tutivog.plainmark'",
        'undo muzzle when-clause no longer scoped to the active Plainmark editor',
      );
    });
  });
});
