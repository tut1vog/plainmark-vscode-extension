// VS Code Desktop: the REAL webview→host write path.
//
// host-smoke.test.ts substitutes an EXTERNAL applyEdit for the webview and never
// runs apply_full_replace. This suite instead injects a synthetic webview
// `update` message into the live onDidReceiveMessage dispatch (provider.ts)
// through the PLAINMARK_TEST_HOOK seam, so the whole path
//   onDidReceiveMessage → parse → sync loop → apply_full_replace
//     (URI guard + EOL translate + whole-doc range + WorkspaceEdit + applyEdit)
// runs end to end and its effect on the TextDocument is asserted.
//
// The seam is inert without the env var (see PlainmarkEditorProvider); the
// harness arms it via `extensionTestsEnv` in run-tests.mjs. The injector command
// (`tutivog.plainmark.__test__inject_message`) is registered only under that env
// var and is absent from package.json, so it never surfaces in a shipped build.
//
// Clauses: SYNC-W-3 (LF→native whole-doc replace), SYNC-P-2 (a byte-changing
// update marks the document dirty), INV-SP-3 / SYNC-P-6 (EOL follows the
// TextDocument — the CRLF case translates LF back to CRLF).

import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const INJECT_CMD = 'tutivog.plainmark.__test__inject_message';

function settle(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function with_seed<T>(contents: string, fn: (uri: vscode.Uri) => Promise<T>): Promise<T> {
  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'plainmark-write-'));
  const file = path.join(tmpdir, 'doc.md');
  // Write the exact bytes so a CRLF seed keeps its CRLF EOLs on disk.
  await fs.writeFile(file, contents, 'utf8');
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
  // Let resolveCustomTextEditor run and the real webview post `ready`, whose
  // seed `sync` grounds the loop's last_synced_version, before we inject.
  await settle(800);
  return vscode.workspace.openTextDocument(uri);
}

// Inject a synthetic webview `update` and wait for the resulting apply. On a
// freshly-opened, unedited doc, base_version must equal the current doc.version
// — exactly what a real webview posts for the first user edit (the version of
// the seed sync it applied). Retries absorb ready-handshake timing: until the
// seed sync lands, the loop rejects the update as stale and the doc stays clean.
async function inject_update(doc: vscode.TextDocument, uri: vscode.Uri, lf_text: string): Promise<void> {
  for (let attempt = 0; attempt < 15; attempt++) {
    await vscode.commands.executeCommand(INJECT_CMD, uri.toString(), {
      type: 'update',
      text: lf_text,
      base_version: doc.version,
    });
    if (doc.isDirty) return;
    await settle(150);
  }
}

suite('Plainmark webview→host write path SYNC-W-3 SYNC-P-2 INV-SP-3 SYNC-P-6', () => {
  test('LF document: an injected update applies LF bytes and marks dirty', async () => {
    const seed = '# Heading\n\nFirst paragraph.\n';
    await with_seed(seed, async (uri) => {
      const doc = await open_in_plainmark(uri);
      assert.strictEqual(doc.isDirty, false, 'freshly opened document should be clean');
      assert.strictEqual(doc.getText(), seed, 'document should hold the on-disk seed');

      // The webview always speaks LF. Extend the first paragraph.
      const edited = '# Heading\n\nFirst paragraph. More.\n';
      await inject_update(doc, uri, edited);

      assert.strictEqual(doc.isDirty, true, 'a byte-changing update must mark dirty (SYNC-P-2)');
      assert.strictEqual(doc.getText(), edited, 'LF document must hold the injected LF bytes');
    });
  });

  test('CRLF document: an LF update is translated back to CRLF bytes (INV-SP-3)', async () => {
    // Seed CRLF on disk; VS Code opens an existing file with its detected EOL.
    const seed = '# Heading\r\n\r\nFirst paragraph.\r\n';
    await with_seed(seed, async (uri) => {
      const doc = await open_in_plainmark(uri);
      assert.strictEqual(doc.eol, vscode.EndOfLine.CRLF, 'seed must open as a CRLF document');
      assert.strictEqual(doc.isDirty, false, 'freshly opened document should be clean');

      // The webview holds and posts LF regardless of the document's native EOL.
      const edited_lf = '# Heading\n\nFirst paragraph. More.\n';
      await inject_update(doc, uri, edited_lf);

      assert.strictEqual(doc.isDirty, true, 'a byte-changing update must mark dirty (SYNC-P-2)');
      // apply_full_replace must translate LF → the document's native CRLF.
      const expected_crlf = '# Heading\r\n\r\nFirst paragraph. More.\r\n';
      assert.strictEqual(
        doc.getText(),
        expected_crlf,
        'CRLF document must receive CRLF bytes (INV-SP-3 / SYNC-P-6)',
      );
    });
  });
});
