// @vscode/test-web activation smoke (T28.8). Runs inside the browser
// workbench's extension host; the `vscode` import is the live web API.
//
// Three assertions:
//   1. `vscode.extensions.getExtension('tutivog.plainmark').activate()`
//      resolves without throwing and `isActive` becomes true.
//   2. The console.error spy installed before activation captures zero
//      calls — would have caught T19.13's cold-boot CSS-var race.
//   3. `vscode.commands.executeCommand('vscode.openWith', uri, 'tutivog.plainmark')`
//      for a virtual `.md` URI does not throw and registers a TextDocument.

// Browser bundle — Node's `assert` module isn't available; use a minimal
// inline assert that throws on failure (Mocha catches the throw and reports
// the test as failed).
import * as vscode from 'vscode';

function ok(value: unknown, msg: string): asserts value {
  if (!value) throw new Error(msg);
}
function strict_equal<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) throw new Error(`${msg} (actual=${String(actual)}, expected=${String(expected)})`);
}
function fail(msg: string): never {
  throw new Error(msg);
}

interface CapturedError {
  args: unknown[];
}

const captured: CapturedError[] = [];
const original_error = console.error;
console.error = (...args: unknown[]) => {
  captured.push({ args });
  original_error.apply(console, args);
};

suite('Plainmark web smoke (T28.8) SHELL-A-5', () => {
  test('extension activates without throwing', async () => {
    const ext = vscode.extensions.getExtension('tutivog.plainmark');
    ok(ext, 'extension not registered');
    await ext.activate();
    strict_equal(ext.isActive, true, 'extension did not become active');
  });

  test('no console.error fired during activation', () => {
    if (captured.length > 0) {
      const summaries = captured.map((c) =>
        c.args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '),
      );
      fail(`console.error called ${captured.length} time(s) during activation:\n  ${summaries.join('\n  ')}`);
    }
  });

  test('vscode.openWith for a .md does not throw', async () => {
    // The workspace served by @vscode/test-web is the
    // extensionDevelopmentPath; pick a small in-repo .md if there is one,
    // otherwise create a virtual untitled URI.
    const candidates = await vscode.workspace.findFiles('**/*.md', undefined, 1);
    let uri: vscode.Uri;
    if (candidates.length > 0) {
      uri = candidates[0];
    } else {
      uri = vscode.Uri.parse('untitled:smoke.md');
    }
    await vscode.commands.executeCommand('vscode.openWith', uri, 'tutivog.plainmark');
    // Give the webview a brief moment to settle before we ask about the doc.
    await new Promise((r) => setTimeout(r, 500));
    const docs = vscode.workspace.textDocuments;
    ok(
      docs.some((d) => d.uri.toString() === uri.toString()),
      `expected ${uri.toString()} to be in workspace.textDocuments`,
    );
  });
});
