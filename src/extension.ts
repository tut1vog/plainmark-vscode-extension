import * as vscode from 'vscode';
import { PlainmarkEditorProvider } from './host/provider';
import { create_logger } from './log.js';

const log = create_logger('init');

export function activate(context: vscode.ExtensionContext): void {
  log.debug('plainmark activate');
  context.subscriptions.push(PlainmarkEditorProvider.register(context));
}

export function deactivate(): void {}
