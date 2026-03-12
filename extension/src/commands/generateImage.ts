import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { VeniceClient } from '../venice/client';
import { getProjectsDir } from '../utils/env';

export async function generateImageCommand(client: VeniceClient | null) {
  if (!client) {
    vscode.window.showErrorMessage(
      'No API key configured. Use "Creative Writer: Set Venice API Key" first.'
    );
    return;
  }

  const prompt = await vscode.window.showInputBox({
    placeHolder: 'e.g. "a Victorian detective\'s cluttered study at dusk"',
    title: 'Describe the image you want to generate',
    prompt: 'Be descriptive — style, mood, lighting, details all help.',
  });

  if (!prompt) { return; }

  const sizeChoice = await vscode.window.showQuickPick(
    [
      { label: 'Square (1024x1024)', width: 1024, height: 1024 },
      { label: 'Landscape (1024x768)', width: 1024, height: 768 },
      { label: 'Portrait (768x1024)', width: 768, height: 1024 },
      { label: 'Wide (1280x720)', width: 1280, height: 720 },
    ],
    { placeHolder: 'Choose image size', title: 'Image Size' }
  );

  if (!sizeChoice) { return; }

  const outputDir = resolveOutputDir();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Generating image...',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'Sending request to Venice AI...' });

      try {
        const filepath = await client.generateImage(prompt, outputDir, {
          width: sizeChoice.width,
          height: sizeChoice.height,
        });

        progress.report({ message: 'Image saved!' });

        const openChoice = await vscode.window.showInformationMessage(
          `Image generated: ${path.basename(filepath)}`,
          'Open Image',
          'Open Folder'
        );

        if (openChoice === 'Open Image') {
          vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filepath));
        } else if (openChoice === 'Open Folder') {
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filepath));
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Image generation failed: ${err.message}`);
      }
    }
  );
}

function resolveOutputDir(): string {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const filePath = editor.document.fileName;
    const projectsDir = getProjectsDir();
    if (projectsDir && filePath.startsWith(projectsDir)) {
      const relative = filePath.slice(projectsDir.length + 1);
      const projectName = relative.split(path.sep)[0];
      const imagesDir = path.join(projectsDir, projectName, 'images');
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }
      return imagesDir;
    }
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const fallback = path.join(workspaceRoot || '.', 'projects', 'images');
  if (!fs.existsSync(fallback)) {
    fs.mkdirSync(fallback, { recursive: true });
  }
  return fallback;
}
