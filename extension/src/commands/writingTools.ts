import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getTextStats, cleanUpText } from '../utils/markdown';
import { VeniceClient } from '../venice/client';
import {
  WRITING_ASSISTANT_SYSTEM,
  NAME_GENERATOR_PROMPT,
  SUMMARIZE_PROMPT,
  CREATIVE_BLOCK_PROMPTS,
} from '../venice/prompts';
import { ChatViewProvider } from '../sidebar/ChatViewProvider';

export function wordCountCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('Open a file to see word count.');
    return;
  }

  const text = editor.document.getText();
  const stats = getTextStats(text);
  const fileName = path.basename(editor.document.fileName);

  vscode.window.showInformationMessage(
    `${fileName}: ${stats.words.toLocaleString()} words | ${stats.pages} pages | ${stats.readingTime} read`,
    { modal: false }
  );
}

export function formatTextCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('Open a file to format.');
    return;
  }

  const document = editor.document;
  const selection = editor.selection;
  const hasSelection = !selection.isEmpty;
  const range = hasSelection
    ? selection
    : new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));

  const original = document.getText(range);
  const cleaned = cleanUpText(original);

  if (original === cleaned) {
    vscode.window.showInformationMessage('Text already looks clean!');
    return;
  }

  editor.edit((editBuilder) => {
    editBuilder.replace(range, cleaned);
  }).then((success) => {
    if (success) {
      vscode.window.showInformationMessage('Text formatted: smart quotes, em dashes, and spacing cleaned up.');
    }
  });
}

export function spellCheckCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('Open a file to spell check.');
    return;
  }

  const config = vscode.workspace.getConfiguration('editor');
  const currentWordCheck = config.get<boolean>('wordBasedSuggestions');

  if (!currentWordCheck) {
    config.update('wordBasedSuggestions', true, vscode.ConfigurationTarget.Workspace);
  }

  vscode.commands.executeCommand('editor.action.triggerSuggest');
  vscode.window.showInformationMessage(
    'Spell checking: misspelled words will show squiggly underlines. Hover over them for suggestions.'
  );
}

export function creativeHelpCommand(chatProvider: ChatViewProvider) {
  const prompt = CREATIVE_BLOCK_PROMPTS[
    Math.floor(Math.random() * CREATIVE_BLOCK_PROMPTS.length)
  ];

  vscode.window.showInformationMessage(prompt, 'Tell me more', 'Another one').then((action) => {
    if (action === 'Tell me more') {
      chatProvider.sendMessageToChat(
        `I'm stuck. You suggested: "${prompt}" — can you help me explore that idea further?`
      );
      vscode.commands.executeCommand('creativeWriter.chatView.focus');
    } else if (action === 'Another one') {
      creativeHelpCommand(chatProvider);
    }
  });
}

export function askAICommand(chatProvider: ChatViewProvider) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.commands.executeCommand('creativeWriter.chatView.focus');
    return;
  }

  const selection = editor.document.getText(editor.selection);
  if (!selection) {
    vscode.commands.executeCommand('creativeWriter.chatView.focus');
    return;
  }

  chatProvider.sendMessageToChat(
    `Here's a passage from my manuscript. What do you think? Any suggestions?\n\n"${selection}"`
  );
  vscode.commands.executeCommand('creativeWriter.chatView.focus');
}

export function summarizeCommand(chatProvider: ChatViewProvider) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('Open a file to summarize.');
    return;
  }

  const content = editor.document.getText();
  if (content.trim().length < 50) {
    vscode.window.showInformationMessage('Not enough text to summarize.');
    return;
  }

  const truncated = content.length > 10000
    ? content.slice(0, 10000) + '\n\n[...truncated for length]'
    : content;

  chatProvider.sendMessageToChat(
    `Summarize this text — capture the key events, emotional arc, and any unresolved threads:\n\n${truncated}`
  );
  vscode.commands.executeCommand('creativeWriter.chatView.focus');
}

export function suggestNamesCommand(chatProvider: ChatViewProvider) {
  vscode.window.showInputBox({
    placeHolder: 'e.g. "Victorian-era British names" or "fantasy elf names"',
    title: 'What kind of names?',
    prompt: 'Describe the style, culture, or vibe you want. Leave blank for a random mix.',
  }).then((input) => {
    const request = input?.trim()
      ? `Suggest 10 character names with this vibe: ${input}. For each, give a one-line impression of who this person might be.`
      : 'Suggest 10 interesting character names — mix of genders, cultures, and styles. For each, give a one-line impression of who this person might be.';

    chatProvider.sendMessageToChat(request);
    vscode.commands.executeCommand('creativeWriter.chatView.focus');
  });
}

export function setApiKeyCommand(chatProvider: ChatViewProvider) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Open a workspace folder first.');
    return;
  }

  vscode.window.showInputBox({
    placeHolder: 'vn_your_key_here',
    title: 'Enter your Venice AI API Key',
    prompt: 'Get a free key at venice.ai/settings/api. It starts with "vn_".',
    password: true,
    validateInput: (value) => {
      if (!value.trim()) { return 'Please enter an API key'; }
      if (!value.startsWith('vn_')) { return 'Venice API keys start with "vn_"'; }
      return null;
    },
  }).then((key) => {
    if (!key) { return; }

    const envPath = path.join(workspaceRoot, '.env');
    let content = '';

    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf-8');
      if (content.match(/^\s*VENICE_API_KEY\s*=/m)) {
        content = content.replace(
          /^\s*VENICE_API_KEY\s*=.*/m,
          `VENICE_API_KEY=${key}`
        );
      } else {
        content += `\nVENICE_API_KEY=${key}\n`;
      }
    } else {
      content = `VENICE_API_KEY=${key}\n`;
    }

    fs.writeFileSync(envPath, content);
    chatProvider.updateApiKey(key);
    vscode.window.showInformationMessage('API key saved! You\'re ready to write.');
  });
}
