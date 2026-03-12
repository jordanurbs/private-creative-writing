import * as vscode from 'vscode';
import { ChatViewProvider } from '../sidebar/ChatViewProvider';
import { VeniceClient } from '../venice/client';
import { newProjectCommand } from './newProject';
import {
  wordCountCommand,
  formatTextCommand,
  spellCheckCommand,
  creativeHelpCommand,
  askAICommand,
  summarizeCommand,
  suggestNamesCommand,
  setApiKeyCommand,
} from './writingTools';
import { generateImageCommand } from './generateImage';
import { ProjectTreeProvider } from '../views/ProjectTreeProvider';

export function registerCommands(
  context: vscode.ExtensionContext,
  chatProvider: ChatViewProvider,
  projectProvider: ProjectTreeProvider,
  apiKey: string | undefined
) {
  const client = apiKey ? new VeniceClient(apiKey) : null;

  const commands: Array<[string, () => any]> = [
    ['creativeWriter.newProject', () => {
      newProjectCommand().then(() => projectProvider.refresh());
    }],
    ['creativeWriter.wordCount', wordCountCommand],
    ['creativeWriter.formatText', formatTextCommand],
    ['creativeWriter.spellCheck', spellCheckCommand],
    ['creativeWriter.creativeHelp', () => creativeHelpCommand(chatProvider)],
    ['creativeWriter.askAI', () => askAICommand(chatProvider)],
    ['creativeWriter.summarize', () => summarizeCommand(chatProvider)],
    ['creativeWriter.suggestNames', () => suggestNamesCommand(chatProvider)],
    ['creativeWriter.generateImage', () => generateImageCommand(client)],
    ['creativeWriter.refreshProject', () => projectProvider.refresh()],
    ['creativeWriter.setApiKey', () => setApiKeyCommand(chatProvider)],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, handler)
    );
  }
}
