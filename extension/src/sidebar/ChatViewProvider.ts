import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { VeniceClient, ChatMessage } from '../venice/client';
import {
  WRITING_ASSISTANT_SYSTEM,
  buildContextPrompt,
  CREATIVE_BLOCK_PROMPTS,
  STYLE_ANALYSIS_PROMPT,
} from '../venice/prompts';
import { getTextStats } from '../utils/markdown';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'creativeWriter.chatView';
  private view?: vscode.WebviewView;
  private client: VeniceClient | null;
  private conversationHistory: ChatMessage[] = [];
  private abortController?: AbortController;

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    apiKey: string | undefined
  ) {
    this.client = apiKey ? new VeniceClient(apiKey) : null;
  }

  updateApiKey(key: string) {
    if (this.client) {
      this.client.setApiKey(key);
    } else {
      this.client = new VeniceClient(key);
    }
    this.postMessage({ type: 'apiKeySet' });
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionContext.extensionUri],
    };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'sendMessage':
          await this.handleUserMessage(msg.text);
          break;
        case 'stopGeneration':
          this.abortController?.abort();
          break;
        case 'clearChat':
          this.conversationHistory = [];
          break;
        case 'toolAction':
          await this.handleToolAction(msg.action);
          break;
        case 'ready':
          if (!this.client) {
            this.postMessage({ type: 'noApiKey' });
          }
          break;
      }
    });
  }

  private async handleUserMessage(text: string) {
    if (!this.client) {
      this.postMessage({
        type: 'assistantMessage',
        text: 'No API key found. Please add your Venice API key to the `.env` file in the workspace root, then reload the window.',
        done: true,
      });
      return;
    }

    const context = this.gatherContext();
    const systemMessage: ChatMessage = {
      role: 'system',
      content: WRITING_ASSISTANT_SYSTEM + context,
    };

    this.conversationHistory.push({ role: 'user', content: text });

    const messages: ChatMessage[] = [
      systemMessage,
      ...this.conversationHistory.slice(-20),
    ];

    this.postMessage({ type: 'assistantMessage', text: '', done: false });

    this.abortController = new AbortController();

    try {
      const fullResponse = await this.client.chatStream(
        messages,
        (chunk) => {
          if (chunk.done) {
            this.postMessage({ type: 'streamDone' });
          } else {
            this.postMessage({ type: 'streamChunk', text: chunk.content });
          }
        },
        this.abortController.signal
      );
      this.conversationHistory.push({ role: 'assistant', content: fullResponse });
    } catch (err: any) {
      if (err.message !== 'Request aborted') {
        this.postMessage({
          type: 'assistantMessage',
          text: `Something went wrong: ${err.message}`,
          done: true,
        });
      }
    }
  }

  private async handleToolAction(action: string) {
    const editor = vscode.window.activeTextEditor;

    switch (action) {
      case 'wordCount': {
        const text = editor?.document.getText() || '';
        const stats = getTextStats(text);
        this.postMessage({
          type: 'assistantMessage',
          text: `**${editor?.document.fileName.split('/').pop() || 'Current file'}**\n\n` +
            `- **Words:** ${stats.words.toLocaleString()}\n` +
            `- **Characters:** ${stats.characters.toLocaleString()}\n` +
            `- **Sentences:** ${stats.sentences.toLocaleString()}\n` +
            `- **Paragraphs:** ${stats.paragraphs.toLocaleString()}\n` +
            `- **Reading time:** ${stats.readingTime}\n` +
            `- **Pages (est.):** ${stats.pages}`,
          done: true,
        });
        break;
      }
      case 'creativeBlock': {
        const prompt = CREATIVE_BLOCK_PROMPTS[
          Math.floor(Math.random() * CREATIVE_BLOCK_PROMPTS.length)
        ];
        this.postMessage({
          type: 'assistantMessage',
          text: `**Try this:**\n\n${prompt}`,
          done: true,
        });
        break;
      }
      case 'suggestNames': {
        await this.handleUserMessage(
          'Suggest 10 interesting character names. Mix of genders, cultures, and styles. For each name, give a one-line impression of who this person might be.'
        );
        break;
      }
      case 'summarize': {
        const content = editor?.document.getText();
        if (!content) {
          this.postMessage({
            type: 'assistantMessage',
            text: 'Open a file first, and I\'ll summarize it for you.',
            done: true,
          });
          return;
        }
        const truncated = content.length > 10000
          ? content.slice(0, 10000) + '\n[...truncated]'
          : content;
        await this.handleUserMessage(
          `Summarize this text. Capture the key events, emotional arc, and any unresolved threads:\n\n${truncated}`
        );
        break;
      }
      case 'improveSelection': {
        const selection = editor?.document.getText(editor.selection);
        if (!selection) {
          this.postMessage({
            type: 'assistantMessage',
            text: 'Select some text in the editor first, then I can help improve it.',
            done: true,
          });
          return;
        }
        await this.handleUserMessage(
          `Here's a passage from my manuscript. Suggest ways to strengthen it -- tighten the prose, vary sentence rhythm, sharpen imagery. Show me a revised version alongside the original.\n\n"${selection}"`
        );
        break;
      }
      case 'analyzeStyle': {
        const content = editor?.document.getText();
        if (!content || content.trim().length < 200) {
          this.postMessage({
            type: 'assistantMessage',
            text: 'Open a file with at least a few paragraphs of your writing. I\'ll analyze your style and create a guide the AI will follow whenever it writes for you.',
            done: true,
          });
          return;
        }
        const sample = content.length > 8000 ? content.slice(0, 8000) : content;
        await this.handleUserMessage(
          `${STYLE_ANALYSIS_PROMPT}\n\n---\n\n${sample}\n\n---\n\nAfter you produce the style guide, I'll save it to my project's style-guide.md file so the AI uses it every time.`
        );

        const projectDir = this.getProjectDir();
        if (projectDir && this.conversationHistory.length > 0) {
          const lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
          if (lastMsg.role === 'assistant' && lastMsg.content.length > 50) {
            const sgPath = path.join(projectDir, 'style-guide.md');
            const header = '# Style Guide\n\n*Auto-generated from your manuscript. Edit freely to refine.*\n\n---\n\n';
            fs.writeFileSync(sgPath, header + lastMsg.content);
            this.postMessage({
              type: 'assistantMessage',
              text: 'Style guide saved to `style-guide.md` in your project folder. The AI will follow it from now on. You can edit it anytime to fine-tune.',
              done: true,
            });
          }
        }
        break;
      }
      case 'importDocument': {
        vscode.commands.executeCommand('creativeWriter.importDocument');
        break;
      }
      case 'exportProject': {
        vscode.commands.executeCommand('creativeWriter.exportProject');
        break;
      }
      case 'analyzeNovel': {
        vscode.commands.executeCommand('creativeWriter.analyzeNovel');
        break;
      }
      case 'rewriteChapter': {
        vscode.commands.executeCommand('creativeWriter.rewriteChapter');
        break;
      }
      case 'continueWriting': {
        const content = editor?.document.getText();
        if (!content || content.trim().length < 20) {
          this.postMessage({
            type: 'assistantMessage',
            text: 'Open a file with some writing in it, and I\'ll continue from where you left off.',
            done: true,
          });
          return;
        }
        const selection2 = editor?.document.getText(editor!.selection);
        const textToUse = (selection2 && selection2.trim().length > 10) ? selection2 : content;
        const label = (selection2 && selection2.trim().length > 10) ? 'selected passage' : 'chapter';
        const tail = textToUse.length > 6000
          ? textToUse.slice(-6000)
          : textToUse;
        await this.handleUserMessage(
          `Continue writing this ${label} from where it leaves off. Match the voice, tense, point of view, and tone exactly. Write the next few paragraphs naturally, as if the same author kept going. Don't repeat what's already written -- just pick up where it stops.\n\n---\n\n${tail}`
        );
        break;
      }
    }
  }

  private getProjectDir(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return undefined; }
    const currentFile = editor.document.fileName;
    const projectMatch = currentFile.match(/projects[/\\]([^/\\]+)/);
    if (!projectMatch) { return undefined; }
    return currentFile.slice(0, currentFile.indexOf(projectMatch[0]) + projectMatch[0].length);
  }

  private gatherContext(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return ''; }

    const currentFile = editor.document.fileName;
    const currentContent = editor.document.getText();

    let projectType: string | undefined;
    let projectTitle: string | undefined;
    let outline: string | undefined;
    let characters: string | undefined;
    let styleGuide: string | undefined;

    const projectDir = this.getProjectDir();
    if (projectDir) {
      const projectMatch = currentFile.match(/projects[/\\]([^/\\]+)/);
      projectTitle = projectMatch?.[1]?.replace(/[-_]/g, ' ');

      const outlinePath = path.join(projectDir, 'outline.md');
      if (fs.existsSync(outlinePath)) {
        try {
          outline = fs.readFileSync(outlinePath, 'utf-8').slice(0, 4000);
        } catch { /* ignore */ }
      }

      const stylePath = path.join(projectDir, 'style-guide.md');
      if (fs.existsSync(stylePath)) {
        try {
          styleGuide = fs.readFileSync(stylePath, 'utf-8').slice(0, 3000);
        } catch { /* ignore */ }
      }

      const charsDir = path.join(projectDir, 'characters');
      if (fs.existsSync(charsDir)) {
        try {
          const files = fs.readdirSync(charsDir).filter(f => f.endsWith('.md'));
          const charTexts = files.map(f => fs.readFileSync(path.join(charsDir, f), 'utf-8'));
          characters = charTexts.join('\n\n---\n\n').slice(0, 4000);
        } catch { /* ignore */ }
      }

      if (currentFile.includes('chapters')) { projectType = 'novel'; }
      else if (currentFile.includes('acts')) { projectType = 'screenplay'; }
      else if (currentFile.includes('posts')) { projectType = 'blog'; }
      else if (currentFile.includes('poems')) { projectType = 'poetry collection'; }
    }

    return buildContextPrompt({
      projectType,
      projectTitle,
      currentFile: currentFile.split('/').pop(),
      currentContent: currentContent.slice(0, 8000),
      outline,
      characters,
      styleGuide,
    });
  }

  public sendMessageToChat(text: string) {
    this.postMessage({ type: 'insertUserMessage', text });
    this.handleUserMessage(text);
  }

  private postMessage(msg: any) {
    this.view?.webview.postMessage(msg);
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-sideBar-background);
    --fg: var(--vscode-sideBar-foreground);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --input-border: var(--vscode-input-border);
    --button-bg: var(--vscode-button-background);
    --button-fg: var(--vscode-button-foreground);
    --button-hover: var(--vscode-button-hoverBackground);
    --user-bg: var(--vscode-textBlockQuote-background);
    --assistant-bg: transparent;
    --border: var(--vscode-panel-border);
    --muted: var(--vscode-descriptionForeground);
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--fg);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .tab {
    flex: 1;
    padding: 8px 4px;
    text-align: center;
    cursor: pointer;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
    border-bottom: 2px solid transparent;
    background: none;
    border-top: none;
    border-left: none;
    border-right: none;
  }

  .tab.active {
    color: var(--fg);
    border-bottom-color: var(--button-bg);
  }

  .tab:hover { color: var(--fg); }

  .panel { display: none; flex-direction: column; flex: 1; overflow: hidden; }
  .panel.active { display: flex; }

  /* Chat panel */
  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .message {
    padding: 10px 12px;
    border-radius: 8px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-size: 13px;
  }

  .message.user {
    background: var(--user-bg);
    align-self: flex-end;
    max-width: 90%;
    border-bottom-right-radius: 2px;
  }

  .message.assistant {
    background: var(--assistant-bg);
    align-self: flex-start;
    max-width: 100%;
  }

  .message.system {
    color: var(--muted);
    font-style: italic;
    font-size: 12px;
    text-align: center;
    padding: 6px;
  }

  .message strong { font-weight: 600; }
  .message em { font-style: italic; }
  .message code {
    background: var(--input-bg);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
  }

  .input-area {
    border-top: 1px solid var(--border);
    padding: 10px;
    flex-shrink: 0;
  }

  .input-row {
    display: flex;
    gap: 6px;
  }

  #userInput {
    flex: 1;
    padding: 8px 10px;
    border: 1px solid var(--input-border);
    border-radius: 6px;
    background: var(--input-bg);
    color: var(--input-fg);
    font-family: var(--vscode-font-family);
    font-size: 13px;
    resize: none;
    min-height: 36px;
    max-height: 120px;
    outline: none;
  }

  #userInput:focus { border-color: var(--button-bg); }

  .send-btn, .stop-btn {
    padding: 8px 14px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    flex-shrink: 0;
  }

  .send-btn {
    background: var(--button-bg);
    color: var(--button-fg);
  }
  .send-btn:hover { background: var(--button-hover); }
  .send-btn:disabled { opacity: 0.5; cursor: default; }

  .stop-btn {
    background: var(--vscode-errorForeground, #e74c3c);
    color: white;
    display: none;
  }

  .input-meta {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
  }

  .clear-btn {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
  }
  .clear-btn:hover { color: var(--fg); }

  /* Tools panel */
  .tools-grid {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--input-bg);
    color: var(--fg);
    cursor: pointer;
    font-size: 13px;
    text-align: left;
    width: 100%;
  }

  .tool-btn:hover {
    background: var(--user-bg);
    border-color: var(--button-bg);
  }

  .tool-icon { font-size: 16px; flex-shrink: 0; width: 20px; text-align: center; }
  .tool-label { flex: 1; }
  .tool-desc { font-size: 11px; color: var(--muted); margin-top: 2px; }

  .welcome {
    padding: 16px;
    text-align: center;
    color: var(--muted);
    line-height: 1.6;
  }

  .welcome h3 {
    margin-bottom: 8px;
    color: var(--fg);
    font-size: 14px;
  }

  .typing-indicator {
    display: inline-block;
  }

  .typing-indicator span {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--muted);
    margin: 0 2px;
    animation: bounce 1.2s infinite;
  }

  .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
  .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

  @keyframes bounce {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-6px); }
  }
</style>
</head>
<body>
  <div class="tabs">
    <button class="tab active" data-panel="chat">Chat</button>
    <button class="tab" data-panel="tools">Tools</button>
  </div>

  <div id="chatPanel" class="panel active">
    <div id="messages">
      <div class="welcome">
        <h3>Your Writing Assistant</h3>
        <p>Ask me anything about your story, characters, or craft. I'm here to help you write.</p>
      </div>
    </div>
    <div class="input-area">
      <div class="input-row">
        <textarea id="userInput" placeholder="Ask me anything..." rows="1"></textarea>
        <button class="send-btn" id="sendBtn">Send</button>
        <button class="stop-btn" id="stopBtn">Stop</button>
      </div>
      <div class="input-meta">
        <button class="clear-btn" id="clearBtn">Clear chat</button>
        <span class="clear-btn" id="charCount"></span>
      </div>
    </div>
  </div>

  <div id="toolsPanel" class="panel">
    <div class="tools-grid">
      <button class="tool-btn" data-action="wordCount">
        <span class="tool-icon">&#x1D7D8;</span>
        <div>
          <div class="tool-label">Word Count & Stats</div>
          <div class="tool-desc">Words, pages, reading time for current file</div>
        </div>
      </button>
      <button class="tool-btn" data-action="summarize">
        <span class="tool-icon">&#x2261;</span>
        <div>
          <div class="tool-label">Summarize</div>
          <div class="tool-desc">AI summary of the current file</div>
        </div>
      </button>
      <button class="tool-btn" data-action="continueWriting">
        <span class="tool-icon">&#x25B6;</span>
        <div>
          <div class="tool-label">Continue Writing</div>
          <div class="tool-desc">AI picks up where you left off, matching your voice</div>
        </div>
      </button>
      <button class="tool-btn" data-action="improveSelection">
        <span class="tool-icon">&#x270E;</span>
        <div>
          <div class="tool-label">Improve Selection</div>
          <div class="tool-desc">Refine selected text with AI suggestions</div>
        </div>
      </button>
      <button class="tool-btn" data-action="suggestNames">
        <span class="tool-icon">&#x263A;</span>
        <div>
          <div class="tool-label">Suggest Names</div>
          <div class="tool-desc">Generate character or place names</div>
        </div>
      </button>
      <button class="tool-btn" data-action="analyzeStyle">
        <span class="tool-icon">&#x1F58B;</span>
        <div>
          <div class="tool-label">Analyze My Style</div>
          <div class="tool-desc">AI reads your writing, creates a style guide it follows</div>
        </div>
      </button>
      <button class="tool-btn" data-action="creativeBlock">
        <span class="tool-icon">&#x2728;</span>
        <div>
          <div class="tool-label">Creative Block Helper</div>
          <div class="tool-desc">A prompt to get you unstuck</div>
        </div>
      </button>
      <button class="tool-btn" data-action="importDocument">
        <span class="tool-icon">&#x1F4C4;</span>
        <div>
          <div class="tool-label">Import Document</div>
          <div class="tool-desc">Import a .docx or .txt file, auto-split into chapters</div>
        </div>
      </button>
      <button class="tool-btn" data-action="exportProject">
        <span class="tool-icon">&#x1F4BE;</span>
        <div>
          <div class="tool-label">Export Project</div>
          <div class="tool-desc">Save as .docx, .pdf, or .epub</div>
        </div>
      </button>
      <div style="border-top:1px solid var(--border);margin:8px 0;padding-top:4px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);padding:4px 0">Rewrite Tools</div>
      </div>
      <button class="tool-btn" data-action="analyzeNovel">
        <span class="tool-icon">&#x1F50D;</span>
        <div>
          <div class="tool-label">Analyze Novel</div>
          <div class="tool-desc">5 AI passes: characters, plot, themes, style, settings</div>
        </div>
      </button>
      <button class="tool-btn" data-action="rewriteChapter">
        <span class="tool-icon">&#x1F504;</span>
        <div>
          <div class="tool-label">Rewrite Chapter</div>
          <div class="tool-desc">AI rewrites the open chapter using your analysis</div>
        </div>
      </button>
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');
  const charCount = document.getElementById('charCount');

  let isGenerating = false;
  let currentAssistantEl = null;
  let currentAssistantText = '';

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.panel + 'Panel').classList.add('active');
    });
  });

  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Switch to chat panel to show results
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-panel="chat"]').classList.add('active');
      document.getElementById('chatPanel').classList.add('active');
      vscode.postMessage({ type: 'toolAction', action: btn.dataset.action });
    });
  });

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    charCount.textContent = inputEl.value.length > 0 ? inputEl.value.length + ' chars' : '';
  });

  // Send on Enter (Shift+Enter for newline)
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);
  stopBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'stopGeneration' });
    setGenerating(false);
  });

  clearBtn.addEventListener('click', () => {
    messagesEl.innerHTML = '<div class="welcome"><h3>Your Writing Assistant</h3><p>Ask me anything about your story, characters, or craft. Ready when you are.</p></div>';
    vscode.postMessage({ type: 'clearChat' });
  });

  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isGenerating) return;
    addMessage('user', text);
    vscode.postMessage({ type: 'sendMessage', text });
    inputEl.value = '';
    inputEl.style.height = 'auto';
    charCount.textContent = '';
  }

  function addMessage(role, text) {
    // Remove welcome message on first interaction
    const welcome = messagesEl.querySelector('.welcome');
    if (welcome) welcome.remove();

    const el = document.createElement('div');
    el.className = 'message ' + role;
    el.innerHTML = formatMarkdown(text);
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  function setGenerating(val) {
    isGenerating = val;
    sendBtn.style.display = val ? 'none' : 'block';
    stopBtn.style.display = val ? 'block' : 'none';
    sendBtn.disabled = val;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function formatMarkdown(text) {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code (using RegExp constructor to avoid backtick issues in template literal)
    var codeRe = new RegExp(String.fromCharCode(96) + '([^' + String.fromCharCode(96) + ']+)' + String.fromCharCode(96), 'g');
    html = html.replace(codeRe, '<code>$1</code>');
    // Line breaks
    html = html.replace(/\\n/g, '<br>');

    return html;
  }

  // Handle messages from extension
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'assistantMessage':
        if (msg.done) {
          currentAssistantEl = addMessage('assistant', msg.text);
          currentAssistantText = '';
          setGenerating(false);
        } else {
          setGenerating(true);
          currentAssistantText = '';
          currentAssistantEl = addMessage('assistant', '');
          // Add typing indicator
          currentAssistantEl.innerHTML = '<span class="typing-indicator"><span></span><span></span><span></span></span>';
        }
        break;

      case 'streamChunk':
        if (currentAssistantEl) {
          currentAssistantText += msg.text;
          currentAssistantEl.innerHTML = formatMarkdown(currentAssistantText);
          scrollToBottom();
        }
        break;

      case 'streamDone':
        setGenerating(false);
        break;

      case 'noApiKey':
        addMessage('system', 'No API key found. Add your Venice API key to the .env file and reload the window.');
        break;

      case 'apiKeySet':
        addMessage('system', "API key updated. You are ready to write!");
        break;

      case 'insertUserMessage':
        addMessage('user', msg.text);
        break;
    }
  });

  // Signal ready
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
