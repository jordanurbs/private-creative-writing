import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import { getProjectsDir } from '../utils/env';
import { stripMarkdown } from '../utils/markdown';

const FORMATS = [
  { label: 'Word Document (.docx)', value: 'docx' },
  { label: 'PDF (.pdf)', value: 'pdf' },
  { label: 'EPUB (.epub)', value: 'epub' },
];

export async function exportProjectCommand() {
  const projectsDir = getProjectsDir();
  if (!projectsDir || !fs.existsSync(projectsDir)) {
    vscode.window.showErrorMessage('No projects directory found.');
    return;
  }

  const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({ label: d.name.replace(/[-_]/g, ' '), value: d.name }));

  if (projects.length === 0) {
    vscode.window.showInformationMessage('No projects to export. Create one first.');
    return;
  }

  const project = await vscode.window.showQuickPick(projects, {
    placeHolder: 'Which project do you want to export?',
    title: 'Export Project',
  });
  if (!project) { return; }

  const format = await vscode.window.showQuickPick(FORMATS, {
    placeHolder: 'Export as...',
    title: 'Choose Format',
  });
  if (!format) { return; }

  const projectDir = path.join(projectsDir, project.value);
  const chapters = collectChapters(projectDir);

  if (chapters.length === 0) {
    vscode.window.showInformationMessage('No markdown files found in this project.');
    return;
  }

  const title = project.label.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Exporting to ${format.value}...` },
    async () => {
      try {
        let outputPath: string;

        switch (format.value) {
          case 'docx':
            outputPath = await exportDocx(projectDir, title, chapters);
            break;
          case 'pdf':
            outputPath = await exportPdf(projectDir, title, chapters);
            break;
          case 'epub':
            outputPath = await exportEpub(projectDir, title, chapters);
            break;
          default:
            return;
        }

        const action = await vscode.window.showInformationMessage(
          `Exported: ${path.basename(outputPath)}`,
          'Open File', 'Open Folder'
        );

        if (action === 'Open File') {
          vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outputPath));
        } else if (action === 'Open Folder') {
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Export failed: ${err.message}`);
      }
    }
  );
}

interface ChapterData {
  title: string;
  content: string;
  raw: string;
}

function collectChapters(projectDir: string): ChapterData[] {
  const chapters: ChapterData[] = [];
  const chaptersDir = path.join(projectDir, 'chapters');
  const actsDir = path.join(projectDir, 'acts');
  const poemsDir = path.join(projectDir, 'poems');
  const postsDir = path.join(projectDir, 'posts');

  let sourceDir: string | null = null;
  if (fs.existsSync(chaptersDir)) { sourceDir = chaptersDir; }
  else if (fs.existsSync(actsDir)) { sourceDir = actsDir; }
  else if (fs.existsSync(poemsDir)) { sourceDir = poemsDir; }
  else if (fs.existsSync(postsDir)) { sourceDir = postsDir; }

  if (sourceDir) {
    const files = fs.readdirSync(sourceDir)
      .filter(f => f.endsWith('.md'))
      .sort();

    for (const file of files) {
      const raw = fs.readFileSync(path.join(sourceDir, file), 'utf-8');
      const titleMatch = raw.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.md$/, '').replace(/^\d+-/, '').replace(/[-_]/g, ' ');
      const content = raw.replace(/^#\s+.+\n*/, '').trim();
      chapters.push({ title, content, raw });
    }
  } else {
    const mdFiles = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.md') && f !== 'README.md' && f !== 'outline.md' && f !== 'style-guide.md')
      .sort();

    for (const file of mdFiles) {
      const raw = fs.readFileSync(path.join(projectDir, file), 'utf-8');
      const titleMatch = raw.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.md$/, '').replace(/[-_]/g, ' ');
      const content = raw.replace(/^#\s+.+\n*/, '').trim();
      chapters.push({ title, content, raw });
    }
  }

  return chapters;
}

// --- DOCX Export ---

async function exportDocx(projectDir: string, title: string, chapters: ChapterData[]): Promise<string> {
  const sections = chapters.map((ch) => {
    const paragraphs: Paragraph[] = [];

    paragraphs.push(new Paragraph({
      text: ch.title,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 400 },
      pageBreakBefore: paragraphs.length > 0,
    }));

    const lines = stripMarkdown(ch.content).split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        paragraphs.push(new Paragraph({ text: '' }));
      } else {
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: trimmed, font: 'Times New Roman', size: 24 })],
          spacing: { after: 120, line: 360 },
          alignment: AlignmentType.JUSTIFIED,
        }));
      }
    }

    return paragraphs;
  });

  const doc = new Document({
    creator: 'Creative Writer',
    title: title,
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: title,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 800 },
        }),
        ...sections.flat(),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(projectDir, `${title.toLowerCase().replace(/\s+/g, '-')}.docx`);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// --- PDF Export ---

async function exportPdf(projectDir: string, title: string, chapters: ChapterData[]): Promise<string> {
  const outputPath = path.join(projectDir, `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: { Title: title, Creator: 'Creative Writer' },
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    doc.fontSize(28).font('Times-Bold').text(title, { align: 'center' });
    doc.moveDown(4);

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];

      if (i > 0) { doc.addPage(); }

      doc.fontSize(18).font('Times-Bold').text(ch.title, { align: 'center' });
      doc.moveDown(1.5);

      const paragraphs = stripMarkdown(ch.content).split('\n\n');
      doc.fontSize(12).font('Times-Roman');

      for (const para of paragraphs) {
        const cleaned = para.replace(/\n/g, ' ').trim();
        if (cleaned) {
          doc.text(cleaned, { align: 'justify', lineGap: 4, indent: 36 });
          doc.moveDown(0.5);
        }
      }
    }

    doc.end();

    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

// --- EPUB Export ---

async function exportEpub(projectDir: string, title: string, chapters: ChapterData[]): Promise<string> {
  const zip = new JSZip();
  const slug = title.toLowerCase().replace(/\s+/g, '-');
  const uid = `creative-writer-${slug}-${Date.now()}`;

  zip.file('mimetype', 'application/epub+zip');

  zip.file('META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const manifest = chapters.map((_, i) =>
    `    <item id="ch${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n');

  const spine = chapters.map((_, i) =>
    `    <itemref idref="ch${i}"/>`
  ).join('\n');

  const tocItems = chapters.map((ch, i) =>
    `      <navPoint id="np${i}" playOrder="${i + 1}">
        <navLabel><text>${escapeXml(ch.title)}</text></navLabel>
        <content src="ch${i}.xhtml"/>
      </navPoint>`
  ).join('\n');

  zip.file('OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>Author</dc:creator>
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${manifest}
  </manifest>
  <spine toc="ncx">
${spine}
  </spine>
</package>`);

  zip.file('OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${uid}"/></head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${tocItems}
  </navMap>
</ncx>`);

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const paragraphs = stripMarkdown(ch.content).split('\n\n')
      .map(p => p.replace(/\n/g, ' ').trim())
      .filter(p => p.length > 0)
      .map(p => `    <p>${escapeXml(p)}</p>`)
      .join('\n');

    zip.file(`OEBPS/ch${i}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(ch.title)}</title>
<style>body{font-family:serif;margin:2em;line-height:1.6}h1{text-align:center;margin-bottom:1.5em}p{text-indent:1.5em;margin:0.3em 0}</style>
</head>
<body>
  <h1>${escapeXml(ch.title)}</h1>
${paragraphs}
</body>
</html>`);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
  const outputPath = path.join(projectDir, `${slug}.epub`);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
