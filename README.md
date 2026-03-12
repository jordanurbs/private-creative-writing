# Creative Writer

A private AI writing workspace that lives in your code editor. Write novels, short stories, essays, screenplays, poetry, or blog posts with an AI collaborator by your side -- all running locally, all private.

Powered by [Venice](https://venice.ai) for uncensored, private AI assistance and image generation.

---

## What You Get

**An AI writing partner** that lives in your sidebar. Ask it to brainstorm characters, unstick your plot, refine a paragraph, suggest names, or just riff on ideas. It reads your manuscript and understands your story.

**Project templates** for novels, short stories, essays, screenplays, blogs, and poetry collections. Each comes with a thoughtful folder structure -- outlines, character sheets, research folders, notes.

**Writing tools** with one click:
- **Continue Writing** -- AI picks up where you left off, matching your voice
- **Analyze My Style** -- AI reads your prose and builds a style guide it follows
- Word count, page estimates, reading time
- Smart formatting (curly quotes, em dashes, clean spacing)
- AI summaries of your chapters
- Character and place name generator
- Creative block helper (prompts to get you unstuck)
- Image generation for character portraits, settings, mood boards

**A scratch pad** (`notes/`) for random ideas, overheard dialogue, research links -- anything that doesn't belong to a specific project yet.

**A distraction-free editor** tuned for prose. Serif font, generous line height, no clutter. Just you and your words.

---

## Setup (5 minutes, one time)

### What you need

- A computer (Mac, Windows, or Linux)
- [VS Code](https://code.visualstudio.com/) (free) or [Cursor](https://cursor.sh/) (free)
- A Venice account with API credits ([venice.ai](https://venice.ai)—see below for budget estimates) 

### Step by step

**1. Install an editor**

Download and install one of these (both are free):
- [VS Code](https://code.visualstudio.com/) -- the most popular code editor, works great for writing too
- [Cursor](https://cursor.sh/) -- a VS Code fork with extra AI features built in

Either one works. Install it, open it once so it finishes setup, then close it.

**2. Download this project**

Click the green "Code" button on GitHub, then "Download ZIP." Unzip it somewhere you'll remember.

Or if you use git:
```
git clone https://github.com/jordanurbs/private-creative-writing.git
```

**3. Get your Venice API key**

1. Go to [venice.ai/settings/api](https://venice.ai/settings/api)
2. Create an account if you don't have one
3. Click "Create API Key"
4. Copy the key

**4. Run the setup script**

Open a terminal in the project folder:

- **Mac/Linux:** Double-click `scripts/setup.sh` or run:
  ```
  ./scripts/setup.sh
  ```
- **Windows:** Double-click `scripts/setup.bat` or run:
  ```
  scripts\setup.bat
  ```

The script will:
- Install what's needed
- Build the extension
- Ask for your API key
- Open the workspace

**5. Start writing**

Look for the **pen icon** in the left sidebar. Click it to open your AI writing assistant.

That's it. You're ready.

---

## How It Works

### The Sidebar

Your AI assistant has two tabs:

**Chat** -- Talk to it like a writing partner. Some things you might say:

> "I'm stuck on chapter 3. My protagonist needs a reason to leave home but nothing feels right."

> "Help me describe a forest at dawn. I want it to feel eerie, not peaceful."

> "Here's my opening paragraph -- is it strong enough?"

> "What would happen if the villain turned out to be right?"

The AI sees your current manuscript and project files, so it knows your characters, plot, and tone.

**Tools** -- One-click writing utilities:

| Tool | What it does |
|------|-------------|
| Continue Writing | AI picks up where you left off, matching your voice and style |
| Improve Selection | Select text, get AI suggestions for refinement |
| Analyze My Style | Reads your writing, generates a style guide the AI follows |
| Word Count | Words, pages, reading time for the current file |
| Summarize | AI summary of your current chapter or section |
| Suggest Names | Generate character or place names |
| Creative Block | A writing prompt to get you unstuck |

### Right-Click Menu

Select any text in your manuscript, right-click, and choose:
- **Ask Writing Assistant** -- Send the selection to your AI for feedback
- **Word Count** -- Quick stats
- **Format & Clean Up** -- Fix quotes, dashes, spacing

### Continue Writing

Open the chapter you're working on, then click **Continue Writing** in the Tools panel. The AI reads your text (or just your selection, if you highlight a passage) and writes the next few paragraphs in your voice. It matches your tense, point of view, sentence rhythm, and tone.

### Style Guide

Every project includes a `style-guide.md` file. You can fill it in yourself, or click **Analyze My Style** after you've written a few pages -- the AI will read your prose and generate a detailed style profile covering sentence structure, vocabulary, dialogue style, imagery, tone, and quirks. Once created, the style guide is injected into every AI interaction, so Continue Writing, Improve Selection, and chat responses all stay consistent with your voice.

### Image Generation

Use **Creative Writer: Generate Image** from the command palette (Cmd/Ctrl + Shift + P) to generate illustrations. Describe a scene, character, or setting, and the AI creates an image saved to your project's `images/` folder.

---

## Project Structure

When you create a new project (click + in the Project panel), you choose a type:

| Type | Structure |
|------|-----------|
| **Novel** | chapters/, characters/, notes/, research/, world-building/, outline, style guide |
| **Short Story** | story file, notes, style guide |
| **Essay** | outline, drafts/, research/, style guide |
| **Blog** | posts/, drafts/, style guide |
| **Screenplay** | acts/, characters/, notes/, outline, style guide |
| **Poetry Collection** | poems/, notes/, style guide |

Every project also gets a `style-guide.md` for the AI to follow (see Style Guide above).

All files are **Markdown** (.md) -- a simple format that works everywhere. You can always export to other formats later.

There's also a top-level `notes/` directory with a scratch pad for ideas that don't belong to any project.

---

## Privacy

Everything runs on your machine. Your manuscripts are local files that never leave your computer. The AI conversations go through Venice AI's API, which is designed for privacy -- they don't train on your data or store your conversations.

Your API key is stored in a `.env` file that's gitignored (never uploaded if you use git).

---

## Commands Reference

Open the command palette with **Cmd+Shift+P** (Mac) or **Ctrl+Shift+P** (Windows/Linux) and type "Creative Writer" to see all commands:

| Command | Description |
|---------|-------------|
| New Writing Project | Create a new project from a template |
| Word Count & Stats | Show word count, pages, reading time |
| Format & Clean Up | Smart quotes, em dashes, clean spacing |
| Spell Check | Activate spell checking |
| Generate Image | Create an AI illustration |
| Creative Block Helper | Get a prompt to break through a block |
| Ask Writing Assistant | Send selected text to the AI |
| Summarize Current File | AI summary of the current document |
| Suggest Names | Generate character/place names |
| Set Venice API Key | Add or update your API key |

---

## Configuration

You can change the AI model and other settings in VS Code settings (Cmd/Ctrl + ,):

| Setting | Default | Description |
|---------|---------|-------------|
| `creativeWriter.model` | `olafangensan-glm-4.7-flash-heretic` | AI model for text |
| `creativeWriter.imageModel` | `nano-banana-pro` | AI model for images |
| `creativeWriter.apiEndpoint` | `https://api.venice.ai/api/v1` | Venice API URL |

---

## Costs

Venice AI's API is pay-per-use. There is no free API tier -- you'll need credits to use the writing assistant.

### Pricing

- **Text AI** (`olafangensan-glm-4.7-flash-heretic`): $0.14 per million input tokens, $0.80 per million output tokens.
- **Image generation** (`nano-banana-pro`): ~$0.01-0.03 per image.

### What does a writing session cost?

This model is extremely affordable. Some realistic estimates:

| Session type | Interactions | Estimated cost |
|-------------|-------------|----------------|
| Light writing day (10 AI chats) | ~100K input, ~10K output tokens | ~$0.02 |
| Heavy writing day (30 AI chats with full chapter context) | ~300K input, ~30K output tokens | ~$0.07 |
| Heavy day + 5 generated images | Same as above + 5 images | ~$0.20 |
| Writing an entire novel (months of daily use) | Cumulative | ~$2-5 total |

For comparison, a ChatGPT Plus subscription costs $20/month. You could write for *years* on that budget here.

### How to add credits

**Option 1: USD deposit** -- Add funds directly at [venice.ai](https://venice.ai). Straightforward pay-as-you-go.

**Option 2: DIEM token (recommended for regular writers)** -- Venice offers the [DIEM token](https://venice.ai/blog/understanding-venice-compute-units-vcu), which gives you daily AI compute credits through staking. One DIEM equals $1/day of compute, resetting at midnight UTC. If you plan to write regularly, staking DIEM can significantly reduce your costs over time compared to paying per-token.

**Option 3: Pro account** -- Venice Pro ($18/month) includes a $10 API credit on upgrade, plus unlimited web app usage.

---

## Contributing

This is an open-source project. Contributions welcome.

1. Fork the repository
2. Make your changes in `extension/src/`
3. Build with `cd extension && npm run build`
4. Test by pressing F5 in VS Code (launches Extension Development Host)
5. Submit a pull request

---

## License

MIT -- Copyright (c) 2026 Venice AI & Jordan Urbs
