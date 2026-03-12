import * as vscode from 'vscode';
import { ChatViewProvider } from './sidebar/ChatViewProvider';
import { ProjectTreeProvider } from './views/ProjectTreeProvider';
import { registerCommands } from './commands';
import { loadApiKey } from './utils/env';

export function activate(context: vscode.ExtensionContext) {
  const apiKey = loadApiKey();

  const chatProvider = new ChatViewProvider(context, apiKey);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  const projectProvider = new ProjectTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('creativeWriter.projectView', projectProvider)
  );

  registerCommands(context, chatProvider, projectProvider, apiKey);

  if (!apiKey) {
    vscode.window.showInformationMessage(
      'Welcome to Creative Writer! Add your Venice API key to get started.',
      'Set API Key'
    ).then((action) => {
      if (action === 'Set API Key') {
        vscode.commands.executeCommand('creativeWriter.setApiKey');
      }
    });
  }

  const watcher = vscode.workspace.createFileSystemWatcher('**/projects/**');
  watcher.onDidCreate(() => projectProvider.refresh());
  watcher.onDidDelete(() => projectProvider.refresh());
  watcher.onDidChange(() => projectProvider.refresh());
  context.subscriptions.push(watcher);
}

export function deactivate() {}
