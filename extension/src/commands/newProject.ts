import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getProjectsDir, getTemplatesDir } from '../utils/env';

const PROJECT_TYPES = [
  { label: 'Novel', description: 'Chapters, characters, outline, research', value: 'novel' },
  { label: 'Short Story', description: 'Single story with notes', value: 'short-story' },
  { label: 'Essay', description: 'Structured essay with research', value: 'essay' },
  { label: 'Blog', description: 'Blog posts and drafts', value: 'blog' },
  { label: 'Screenplay', description: 'Acts, characters, scenes', value: 'screenplay' },
  { label: 'Poetry Collection', description: 'Poems with notes', value: 'poetry-collection' },
];

export async function newProjectCommand() {
  const projectsDir = getProjectsDir();
  const templatesDir = getTemplatesDir();
  if (!projectsDir || !templatesDir) {
    vscode.window.showErrorMessage('Cannot find workspace directories.');
    return;
  }

  const projectType = await vscode.window.showQuickPick(PROJECT_TYPES, {
    placeHolder: 'What kind of project are you starting?',
    title: 'New Writing Project',
  });
  if (!projectType) { return; }

  const title = await vscode.window.showInputBox({
    placeHolder: 'Enter a title for your project',
    title: 'Project Title',
    prompt: 'This will be the folder name. You can always rename it later.',
    validateInput: (value) => {
      if (!value.trim()) { return 'Please enter a title'; }
      const slug = slugify(value);
      const target = path.join(projectsDir, slug);
      if (fs.existsSync(target)) { return 'A project with this name already exists'; }
      return null;
    },
  });
  if (!title) { return; }

  const slug = slugify(title);
  const projectDir = path.join(projectsDir, slug);
  const templateDir = path.join(templatesDir, projectType.value);

  try {
    if (fs.existsSync(templateDir)) {
      copyDirSync(templateDir, projectDir, title);
    } else {
      createDefaultStructure(projectDir, projectType.value, title);
    }

    const firstFile = findFirstMarkdownFile(projectDir);
    if (firstFile) {
      const doc = await vscode.workspace.openTextDocument(firstFile);
      await vscode.window.showTextDocument(doc);
    }

    vscode.window.showInformationMessage(`Project "${title}" created!`);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to create project: ${err.message}`);
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function copyDirSync(src: string, dest: string, title: string) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, title);
    } else {
      let content = fs.readFileSync(srcPath, 'utf-8');
      content = content.replace(/\{\{title\}\}/g, title);
      content = content.replace(/\{\{date\}\}/g, new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      }));
      fs.writeFileSync(destPath, content);
    }
  }
}

function createDefaultStructure(dir: string, type: string, title: string) {
  fs.mkdirSync(dir, { recursive: true });

  const readme = `# ${title}\n\nCreated: ${new Date().toLocaleDateString()}\nType: ${type}\n`;

  switch (type) {
    case 'novel':
      fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'characters'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'research'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'world-building'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'outline.md'), `# ${title} — Outline\n\n## Premise\n\n## Act One\n\n## Act Two\n\n## Act Three\n`);
      fs.writeFileSync(path.join(dir, 'chapters', '01-chapter-one.md'), `# Chapter One\n\n`);
      break;
    case 'short-story':
      fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'story.md'), `# ${title}\n\n`);
      fs.writeFileSync(path.join(dir, 'notes', 'ideas.md'), `# Ideas & Notes\n\n`);
      break;
    case 'essay':
      fs.mkdirSync(path.join(dir, 'research'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'drafts'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'outline.md'), `# ${title} — Outline\n\n## Thesis\n\n## Arguments\n\n## Conclusion\n`);
      fs.writeFileSync(path.join(dir, 'drafts', 'draft-1.md'), `# ${title}\n\n`);
      break;
    case 'blog':
      fs.mkdirSync(path.join(dir, 'posts'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'drafts'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'posts', '001-first-post.md'), `# ${title}\n\n`);
      break;
    case 'screenplay':
      fs.mkdirSync(path.join(dir, 'acts'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'characters'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'outline.md'), `# ${title} — Outline\n\n## Logline\n\n## Synopsis\n\n## Act Structure\n`);
      fs.writeFileSync(path.join(dir, 'acts', 'act-1.md'), `# Act One\n\n## Scene 1\n\n`);
      break;
    case 'poetry-collection':
      fs.mkdirSync(path.join(dir, 'poems'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'poems', 'untitled-1.md'), `# Untitled\n\n`);
      break;
  }

  fs.writeFileSync(path.join(dir, 'README.md'), readme);
}

function findFirstMarkdownFile(dir: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      return path.join(dir, entry.name);
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findFirstMarkdownFile(path.join(dir, entry.name));
      if (found) { return found; }
    }
  }

  return null;
}
