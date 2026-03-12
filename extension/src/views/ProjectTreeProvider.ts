import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getProjectsDir } from '../utils/env';

export class ProjectTreeProvider implements vscode.TreeDataProvider<ProjectItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ProjectItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ProjectItem): ProjectItem[] {
    const projectsDir = getProjectsDir();
    if (!projectsDir || !fs.existsSync(projectsDir)) {
      return [];
    }

    const targetDir = element ? element.fullPath : projectsDir;
    if (!fs.existsSync(targetDir)) { return []; }

    try {
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      return entries
        .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) { return -1; }
          if (!a.isDirectory() && b.isDirectory()) { return 1; }
          return a.name.localeCompare(b.name);
        })
        .map(entry => {
          const fullPath = path.join(targetDir, entry.name);
          const isDir = entry.isDirectory();
          return new ProjectItem(
            entry.name,
            fullPath,
            isDir
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None,
            isDir
          );
        });
    } catch {
      return [];
    }
  }
}

class ProjectItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly fullPath: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isDirectory: boolean
  ) {
    super(label, collapsibleState);

    if (!isDirectory) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(fullPath)],
      };
      this.contextValue = 'file';
      this.iconPath = this.getFileIcon(label);
    } else {
      this.contextValue = 'directory';
      this.iconPath = new vscode.ThemeIcon(this.getFolderIcon(label));
    }
  }

  private getFileIcon(name: string): vscode.ThemeIcon {
    if (name.endsWith('.md')) { return new vscode.ThemeIcon('markdown'); }
    if (name.endsWith('.txt')) { return new vscode.ThemeIcon('file-text'); }
    if (name.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) { return new vscode.ThemeIcon('file-media'); }
    return new vscode.ThemeIcon('file');
  }

  private getFolderIcon(name: string): string {
    const lower = name.toLowerCase();
    if (lower === 'chapters' || lower === 'acts') { return 'book'; }
    if (lower === 'characters') { return 'person'; }
    if (lower === 'notes') { return 'note'; }
    if (lower === 'research') { return 'search'; }
    if (lower === 'images') { return 'file-media'; }
    if (lower === 'world-building') { return 'globe'; }
    if (lower === 'poems') { return 'heart'; }
    if (lower === 'drafts') { return 'edit'; }
    if (lower === 'posts') { return 'notebook'; }
    return 'folder';
  }
}
