// Shared by the desktop and web suites; bundled into each, so no Node imports.

import * as vscode from 'vscode';

export interface WaitForOptions {
  timeout?: number;
  interval?: number;
  message?: string;
}

// Poll `predicate` until it holds; a rejected predicate propagates immediately.
export async function wait_for(
  predicate: () => boolean | Promise<boolean>,
  { timeout = 5000, interval = 50, message = 'condition' }: WaitForOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) {
      throw new Error(`wait_for: ${message} still false after ${timeout} ms`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

export function plainmark_tab_open(uri: vscode.Uri): boolean {
  const key = uri.toString();
  return vscode.window.tabGroups.all.some((group) =>
    group.tabs.some(
      (tab) =>
        tab.input instanceof vscode.TabInputCustom &&
        tab.input.viewType === 'tutivog.plainmark' &&
        tab.input.uri.toString() === key,
    ),
  );
}
