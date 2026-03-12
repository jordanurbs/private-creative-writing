import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';
import { getProjectsDir } from '../utils/env';

const CHAPTER_PATTERNS = [
  /^#{1,3}\s*(chapter|part|section|act|book)\s+/i,
  /^(chapter|part|section|act|book)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)/i,
  /^(prologue|epilogue|introduction|preface|foreword|afterword|interlude)\s*$/i,
  /^#{1,3}\s+\S/,
];

export async function importDocumentCommand() {
  const fileUri = await vscode.window.showOpenDialog({
    canSelectMany: false,
    title: 'Import a manuscript',
    filters: {
      'Documents': ['docx', 'txt', 'md'],
    },
  });

  if (!fileUri || fileUri.length === 0) { return; }

  const filePath = fileUri[0].fsPath;
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath, ext);

  let rawText: string;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Importing document...' },
    async (progress) => {
      progress.report({ message: 'Reading file...' });

      if (ext === '.docx') {
        const result = await mammoth.extractRawText({ path: filePath });
        rawText = result.value;
      } else {
        rawText = fs.readFileSync(filePath, 'utf-8');
      }

      progress.report({ message: 'Detecting chapters...' });

      const chapters = splitIntoChapters(rawText);

      const projectsDir = getProjectsDir();
      if (!projectsDir) {
        vscode.window.showErrorMessage('Cannot find projects directory.');
        return;
      }

      const projectName = await vscode.window.showInputBox({
        title: 'Project name',
        prompt: 'What should this project be called?',
        value: baseName.replace(/[-_]/g, ' '),
        validateInput: (v) => v.trim() ? null : 'Please enter a name',
      });

      if (!projectName) { return; }

      const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const projectDir = path.join(projectsDir, slug);

      if (fs.existsSync(projectDir)) {
        const overwrite = await vscode.window.showWarningMessage(
          `Project "${projectName}" already exists. Import into it anyway?`,
          'Yes', 'Cancel'
        );
        if (overwrite !== 'Yes') { return; }
      }

      const chaptersDir = path.join(projectDir, 'chapters');
      fs.mkdirSync(chaptersDir, { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'characters'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'notes'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'images'), { recursive: true });

      progress.report({ message: `Writing ${chapters.length} chapter(s)...` });

      if (chapters.length === 1 && !chapters[0].title) {
        fs.writeFileSync(
          path.join(projectDir, 'manuscript.md'),
          `# ${projectName}\n\n${chapters[0].content}`
        );
      } else {
        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          const num = String(i + 1).padStart(2, '0');
          const titleSlug = ch.title
            ? ch.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
            : 'untitled';
          const filename = `${num}-${titleSlug}.md`;
          const heading = ch.title || `Chapter ${i + 1}`;
          fs.writeFileSync(
            path.join(chaptersDir, filename),
            `# ${heading}\n\n${ch.content}`
          );
        }
      }

      fs.writeFileSync(
        path.join(projectDir, 'outline.md'),
        `# ${projectName} -- Outline\n\nImported from: ${path.basename(filePath)}\nChapters: ${chapters.length}\n\n## Structure\n\n` +
        chapters.map((ch, i) => `${i + 1}. ${ch.title || 'Untitled'}`).join('\n') + '\n'
      );

      fs.writeFileSync(
        path.join(projectDir, 'README.md'),
        `# ${projectName}\n\nImported: ${new Date().toLocaleDateString()}\nSource: ${path.basename(filePath)}\nChapters: ${chapters.length}\n`
      );

      const firstFile = chapters.length === 1 && !chapters[0].title
        ? path.join(projectDir, 'manuscript.md')
        : path.join(chaptersDir, fs.readdirSync(chaptersDir).sort()[0]);

      const doc = await vscode.workspace.openTextDocument(firstFile);
      await vscode.window.showTextDocument(doc);

      vscode.window.showInformationMessage(
        `Imported "${projectName}" -- ${chapters.length} chapter(s) created.`
      );
    }
  );
}

interface Chapter {
  title: string;
  content: string;
}

function splitIntoChapters(text: string): Chapter[] {
  const lines = text.split('\n');
  const breaks: Array<{ lineIndex: number; title: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { continue; }

    for (const pattern of CHAPTER_PATTERNS) {
      if (pattern.test(line)) {
        const prevLine = i > 0 ? lines[i - 1]?.trim() : '';
        const nextLine = i < lines.length - 1 ? lines[i + 1]?.trim() : '';
        const looksLikeHeading = !prevLine || !nextLine || line.startsWith('#');

        if (looksLikeHeading) {
          const title = line.replace(/^#+\s*/, '').trim();
          breaks.push({ lineIndex: i, title });
          break;
        }
      }
    }
  }

  if (breaks.length === 0) {
    return [{ title: '', content: text.trim() }];
  }

  const chapters: Chapter[] = [];

  for (let i = 0; i < breaks.length; i++) {
    const start = breaks[i].lineIndex + 1;
    const end = i < breaks.length - 1 ? breaks[i + 1].lineIndex : lines.length;
    const content = lines.slice(start, end).join('\n').trim();
    chapters.push({ title: breaks[i].title, content });
  }

  if (breaks[0].lineIndex > 0) {
    const preamble = lines.slice(0, breaks[0].lineIndex).join('\n').trim();
    if (preamble.length > 100) {
      chapters.unshift({ title: 'Preamble', content: preamble });
    }
  }

  return chapters.filter(ch => ch.content.length > 0);
}
