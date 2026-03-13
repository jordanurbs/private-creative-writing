import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { VeniceClient, ChatMessage } from '../venice/client';
import { WRITING_ASSISTANT_SYSTEM } from '../venice/prompts';
import { getProjectsDir } from '../utils/env';
import { stripMarkdown, getTextStats } from '../utils/markdown';

const ANALYSIS_AGENTS = [
  {
    name: 'Character Analysis',
    filename: 'characters-analysis.md',
    dir: 'characters',
    prompt: `You are a literary analyst. Read the following manuscript carefully and extract EVERY character, including minor ones.

For each character, create a detailed profile:

**Name:** (full name and any aliases/nicknames used)
**Role:** (protagonist, antagonist, supporting, minor)
**First appearance:** (which chapter/section)
**Physical description:** (as described in the text)
**Personality traits:** (demonstrated through actions and dialogue, not just told)
**Arc:** (how they change from start to finish, or if they are static)
**Key relationships:** (with other characters)
**Motivations:** (what drives them)
**Flaws/weaknesses:** (internal conflicts)
**Voice:** (how they speak -- any distinctive patterns, vocabulary, rhythms)
**Strongest scenes:** (where this character shines or has pivotal moments)

After all profiles, add a section called "Relationship Map" showing how characters connect to each other.

Be thorough. Quote brief examples from the text where relevant.`,
  },
  {
    name: 'Plot Structure',
    filename: 'plot-analysis.md',
    prompt: `You are a structural editor. Analyze this manuscript and produce a detailed plot breakdown:

## Overall Structure
- Story type (hero's journey, mystery, coming of age, etc.)
- Narrative arc shape
- Point of view and how it's used
- Timeline (linear, nonlinear, flashbacks)

## Act-by-Act Breakdown
For each major section/act:
- Key events (in order)
- Turning points
- Stakes and tension level
- Pacing assessment (too fast, too slow, well-paced)

## Chapter-by-Chapter Summary
For each chapter, one paragraph covering: what happens, what it advances (plot/character/theme), and whether it earns its place in the story.

## Plot Strengths
What works well structurally.

## Plot Weaknesses
- Plot holes or logical gaps
- Scenes that drag or feel redundant
- Missing setup/payoff
- Pacing problems
- Unresolved threads

## Recommendations
Specific structural suggestions for the rewrite, in priority order.`,
  },
  {
    name: 'Theme & Motif Analysis',
    filename: 'themes-analysis.md',
    prompt: `You are a literary critic. Analyze this manuscript for themes, motifs, and symbols:

## Major Themes
For each theme:
- State the theme
- How it is explored (through which characters, events, imagery)
- Whether it is resolved or left open
- How effectively it lands

## Recurring Motifs
- Images, objects, phrases, or patterns that repeat
- What they represent
- Whether they are used consistently or could be strengthened

## Symbols
- Key symbolic elements
- What they represent on a deeper level

## Emotional Arc
- The emotional journey of the reader through the story
- Moments of highest and lowest emotional impact
- Whether the ending delivers emotionally

## Tonal Consistency
- Is the tone consistent throughout?
- Any jarring shifts?
- Recommendations for tonal cohesion in the rewrite`,
  },
  {
    name: 'Style & Voice Analysis',
    filename: 'style-guide.md',
    prompt: `Analyze this manuscript and produce a style guide that captures the author's voice. Cover:

- **Point of view & tense**
- **Sentence structure** (length patterns, rhythm, variety)
- **Vocabulary register** (literary, conversational, sparse, lush)
- **Dialogue style** (naturalistic? stylized? tag conventions)
- **Imagery & description** (which senses dominate, metaphor density)
- **Emotional tone** (detached, intimate, wry, earnest)
- **Pacing** (scene-level and sentence-level)
- **What this voice avoids**
- **Distinctive quirks**
- **Strengths to preserve** in the rewrite
- **Weaknesses to address** in the rewrite

Write in second person ("You write in...") so it reads as direct instructions for the rewrite. Be specific -- quote brief examples.`,
  },
  {
    name: 'Setting & World-Building',
    filename: 'settings-analysis.md',
    prompt: `Analyze this manuscript for settings and world-building:

## Locations
For each significant location:
- Name and description
- When it appears
- Its role in the story (what it represents, what happens there)
- Sensory details used (or missing)

## Time Period & Context
- When the story is set
- Historical/cultural context that matters
- How time is handled (pacing, seasons, passage of time)

## Atmosphere
- Overall mood/atmosphere
- How setting contributes to tone
- Most vivid settings vs. settings that need more detail

## World-Building Rules
(For speculative fiction) Any rules, systems, or internal logic

## Recommendations
- Settings that need more development
- Opportunities for setting to do more narrative work
- Consistency issues`,
  },
];

export async function analyzeNovelCommand(client: VeniceClient | null) {
  if (!client) {
    vscode.window.showErrorMessage('No API key configured. Set your Venice API key first.');
    return;
  }

  const projectsDir = getProjectsDir();
  if (!projectsDir) {
    vscode.window.showErrorMessage('No projects directory found.');
    return;
  }

  const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({ label: d.name.replace(/[-_]/g, ' '), value: d.name }));

  if (projects.length === 0) {
    vscode.window.showInformationMessage('No projects found. Import or create one first.');
    return;
  }

  const project = await vscode.window.showQuickPick(projects, {
    placeHolder: 'Which project do you want to analyze for rewriting?',
    title: 'Analyze Novel',
  });
  if (!project) { return; }

  const projectDir = path.join(projectsDir, project.value);
  const manuscript = collectFullManuscript(projectDir);

  if (manuscript.length < 500) {
    vscode.window.showInformationMessage('Not enough text to analyze. The project needs at least a few pages.');
    return;
  }

  const stats = getTextStats(manuscript);
  const truncated = manuscript.length > 100000
    ? manuscript.slice(0, 100000) + '\n\n[...manuscript truncated at ~' + Math.round(100000 / 5) + ' words for analysis]'
    : manuscript;

  const confirm = await vscode.window.showInformationMessage(
    `This will analyze "${project.label}" (${stats.words.toLocaleString()} words) using 5 specialized passes. ` +
    `Estimated cost: ~$0.10-0.30. Continue?`,
    'Analyze', 'Cancel'
  );
  if (confirm !== 'Analyze') { return; }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Analyzing novel...',
      cancellable: true,
    },
    async (progress, token) => {
      const totalAgents = ANALYSIS_AGENTS.length;

      for (let i = 0; i < totalAgents; i++) {
        if (token.isCancellationRequested) {
          vscode.window.showInformationMessage('Analysis cancelled. Partial results saved.');
          break;
        }

        const agent = ANALYSIS_AGENTS[i];
        progress.report({
          message: `[${i + 1}/${totalAgents}] ${agent.name}...`,
          increment: (100 / totalAgents),
        });

        try {
          const messages: ChatMessage[] = [
            { role: 'system', content: agent.prompt },
            { role: 'user', content: `Here is the full manuscript:\n\n${truncated}` },
          ];

          const result = await client.chat(messages);

          if (agent.dir) {
            const dir = path.join(projectDir, agent.dir);
            fs.mkdirSync(dir, { recursive: true });
          }

          const header = `# ${agent.name}\n\n*Auto-generated analysis for rewrite planning. Edit freely.*\n\n---\n\n`;
          fs.writeFileSync(path.join(projectDir, agent.filename), header + result);
        } catch (err: any) {
          const errMsg = `Failed on ${agent.name}: ${err.message}`;
          fs.writeFileSync(
            path.join(projectDir, agent.filename),
            `# ${agent.name}\n\nAnalysis failed: ${err.message}\n\nTry running the analysis again.`
          );
          vscode.window.showWarningMessage(errMsg);
        }
      }

      const outlinePath = path.join(projectDir, 'rewrite-plan.md');
      if (!fs.existsSync(outlinePath)) {
        fs.writeFileSync(outlinePath, `# Rewrite Plan -- ${project.label}\n\n` +
          `*Review the analysis files, then write your rewrite goals here.*\n\n` +
          `## What I want to keep\n\n\n## What I want to change\n\n\n## Chapter-by-chapter rewrite notes\n\n`
        );
      }

      vscode.window.showInformationMessage(
        'Analysis complete! Review the results in your project folder, then use "Rewrite Chapter" to begin.',
        'Open Rewrite Plan'
      ).then(action => {
        if (action === 'Open Rewrite Plan') {
          vscode.workspace.openTextDocument(outlinePath).then(doc => {
            vscode.window.showTextDocument(doc);
          });
        }
      });
    }
  );
}

export async function rewriteChapterCommand(client: VeniceClient | null) {
  if (!client) {
    vscode.window.showErrorMessage('No API key configured. Set your Venice API key first.');
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('Open the chapter you want to rewrite.');
    return;
  }

  const currentFile = editor.document.fileName;
  const currentContent = editor.document.getText();

  if (currentContent.trim().length < 100) {
    vscode.window.showInformationMessage('This file is too short to rewrite.');
    return;
  }

  const projectMatch = currentFile.match(/projects[/\\]([^/\\]+)/);
  if (!projectMatch) {
    vscode.window.showInformationMessage('This file is not inside a project folder.');
    return;
  }

  const projectDir = currentFile.slice(0, currentFile.indexOf(projectMatch[0]) + projectMatch[0].length);

  const instructions = await vscode.window.showInputBox({
    title: 'Rewrite Instructions',
    prompt: 'What should the rewrite focus on? (Leave blank for general improvement)',
    placeHolder: 'e.g. "tighten the pacing, make dialogue more natural, deepen the emotional beats"',
  });

  if (instructions === undefined) { return; }

  const context = gatherRewriteContext(projectDir);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: WRITING_ASSISTANT_SYSTEM + '\n\n' +
        'You are now in REWRITE mode. Your job is to rewrite the chapter the writer gives you. ' +
        'Preserve the plot events, character actions, and story progression exactly. ' +
        'Improve the prose quality: tighten sentences, sharpen imagery, deepen emotional resonance, ' +
        'fix pacing, strengthen dialogue. Follow the style guide closely. ' +
        'Output ONLY the rewritten chapter text -- no commentary, no explanations, no "here is the rewrite" preamble. ' +
        'Just the improved prose, ready to paste into the manuscript.' +
        context,
    },
    {
      role: 'user',
      content: (instructions
        ? `Rewrite this chapter with these specific instructions: ${instructions}\n\n`
        : 'Rewrite this chapter, improving the prose while preserving the story:\n\n') +
        currentContent,
    },
  ];

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Rewriting chapter...', cancellable: false },
    async () => {
      try {
        const rewritten = await client.chat(messages);

        const dir = path.dirname(currentFile);
        const base = path.basename(currentFile, '.md');
        const rewritePath = path.join(dir, `${base}.rewrite.md`);

        const header = currentContent.match(/^#\s+.+$/m)?.[0] || '';
        fs.writeFileSync(rewritePath, (header ? header + '\n\n' : '') + rewritten);

        const doc = await vscode.workspace.openTextDocument(rewritePath);
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });

        vscode.window.showInformationMessage(
          `Rewrite saved as ${base}.rewrite.md -- compare side by side with the original.`,
          'Accept Rewrite', 'Discard'
        ).then(action => {
          if (action === 'Accept Rewrite') {
            fs.copyFileSync(currentFile, currentFile.replace('.md', '.original.md'));
            fs.copyFileSync(rewritePath, currentFile);
            fs.unlinkSync(rewritePath);
            vscode.window.showInformationMessage('Rewrite accepted. Original saved as .original.md.');
          } else if (action === 'Discard') {
            fs.unlinkSync(rewritePath);
            vscode.window.showInformationMessage('Rewrite discarded.');
          }
        });
      } catch (err: any) {
        vscode.window.showErrorMessage(`Rewrite failed: ${err.message}`);
      }
    }
  );
}

function collectFullManuscript(projectDir: string): string {
  const parts: string[] = [];

  for (const subdir of ['chapters', 'acts', 'poems', 'posts']) {
    const dir = path.join(projectDir, subdir);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
      for (const file of files) {
        parts.push(fs.readFileSync(path.join(dir, file), 'utf-8'));
      }
    }
  }

  if (parts.length === 0) {
    const files = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.md') && !['README.md', 'outline.md', 'style-guide.md'].includes(f))
      .sort();
    for (const file of files) {
      parts.push(fs.readFileSync(path.join(projectDir, file), 'utf-8'));
    }
  }

  return parts.join('\n\n---\n\n');
}

function gatherRewriteContext(projectDir: string): string {
  const sections: string[] = [];

  const contextFiles = [
    { file: 'style-guide.md', label: 'Style Guide -- FOLLOW THIS VOICE' },
    { file: 'plot-analysis.md', label: 'Plot Analysis' },
    { file: 'characters-analysis.md', label: 'Character Analysis' },
    { file: 'themes-analysis.md', label: 'Themes & Motifs' },
    { file: 'rewrite-plan.md', label: 'Rewrite Plan' },
  ];

  for (const { file, label } of contextFiles) {
    const filePath = path.join(projectDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8').slice(0, 4000);
        sections.push(`\n## ${label}\n${content}`);
      } catch { /* ignore */ }
    }
  }

  if (sections.length === 0) { return ''; }
  return '\n\n---\n\n# REWRITE CONTEXT\n' + sections.join('\n');
}
