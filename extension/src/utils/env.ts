import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function loadApiKey(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return undefined;
  }

  for (const folder of workspaceFolders) {
    const envPath = path.join(folder.uri.fsPath, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/^\s*VENICE_API_KEY\s*=\s*(.+)$/m);
      if (match) {
        return match[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }

  return process.env.VENICE_API_KEY;
}

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function getProjectsDir(): string | undefined {
  const root = getWorkspaceRoot();
  if (!root) { return undefined; }
  return path.join(root, 'projects');
}

export function getTemplatesDir(): string | undefined {
  const root = getWorkspaceRoot();
  if (!root) { return undefined; }
  return path.join(root, 'templates');
}
