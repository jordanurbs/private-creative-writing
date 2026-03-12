#!/bin/bash
set -e

# ============================================================
# Creative Writer — Setup Script
# Run this once to set up your writing workspace.
# ============================================================

echo ""
echo "=== Creative Writer Setup ==="
echo "  Setting up your private writing workspace..."
echo ""

# --------------------------------------------------
# 1. Check for Node.js
# --------------------------------------------------
echo "[1/6] Checking for Node.js..."
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  echo "  OK - Node.js ${NODE_VERSION} found"
else
  echo "  Node.js not found. Installing..."
  if command -v brew &> /dev/null; then
    brew install node
  elif command -v apt-get &> /dev/null; then
    sudo apt-get update && sudo apt-get install -y nodejs npm
  elif command -v dnf &> /dev/null; then
    sudo dnf install -y nodejs npm
  else
    echo "  ERROR: Cannot auto-install Node.js."
    echo "  Please install it from: https://nodejs.org"
    exit 1
  fi
  echo "  OK - Node.js installed"
fi

# --------------------------------------------------
# 2. Check for VS Code or Cursor
# --------------------------------------------------
echo "[2/6] Checking for VS Code / Cursor..."
EDITOR_CMD=""
if command -v cursor &> /dev/null; then
  EDITOR_CMD="cursor"
  echo "  OK - Cursor found"
elif command -v code &> /dev/null; then
  EDITOR_CMD="code"
  echo "  OK - VS Code found"
else
  echo "  WARNING: Neither VS Code nor Cursor CLI found."
  echo "  The extension will be built but you will need to install it manually."
  echo "  Install VS Code from: https://code.visualstudio.com"
fi

# --------------------------------------------------
# 3. Install dependencies and build the extension
# --------------------------------------------------
echo "[3/6] Building the Creative Writer extension..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$PROJECT_ROOT/extension"

cd "$EXTENSION_DIR"
npm install --silent 2>/dev/null
echo "  Dependencies installed"

npm run build 2>/dev/null
echo "  Extension compiled"

npx @vscode/vsce package --no-dependencies --no-git-tag-version --allow-missing-repository 2>/dev/null
VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -1)
echo "  OK - Extension packaged: ${VSIX_FILE}"

# --------------------------------------------------
# 4. Install the extension
# --------------------------------------------------
echo "[4/6] Installing extension..."
if [ -n "$EDITOR_CMD" ] && [ -n "$VSIX_FILE" ]; then
  "$EDITOR_CMD" --install-extension "$VSIX_FILE" --force 2>/dev/null
  echo "  OK - Extension installed into $EDITOR_CMD"
else
  echo "  SKIPPED (no editor CLI found). Install manually:"
  echo "  Open VS Code > Extensions > ... > Install from VSIX > select extension/${VSIX_FILE}"
fi

# --------------------------------------------------
# 5. Set up the API key
# --------------------------------------------------
echo "[5/6] Setting up your Venice API key..."
cd "$PROJECT_ROOT"

if [ -f ".env" ]; then
  echo "  OK - .env file already exists"
else
  echo ""
  echo "  You need a Venice AI API key."
  echo "  Get one at: https://venice.ai/settings/api"
  echo ""
  read -p "  Paste your API key here (or press Enter to skip): " API_KEY

  if [ -n "$API_KEY" ]; then
    echo "VENICE_API_KEY=${API_KEY}" > .env
    echo "  OK - API key saved to .env"
  else
    cp .env.example .env
    echo "  SKIPPED. Edit the .env file later to add your key."
  fi
fi

# --------------------------------------------------
# 6. Create notes directory
# --------------------------------------------------
echo "[6/6] Setting up workspace..."
if [ ! -d "notes" ]; then
  mkdir -p notes
  cat > notes/scratch-pad.md << 'NOTES'
# Scratch Pad

Jot down anything here -- ideas, fragments, reminders, research links, things you overheard on the bus. This file is not tied to any project. It is just for you.

---


NOTES
  echo "  OK - notes/ directory created"
fi

# --------------------------------------------------
# Done!
# --------------------------------------------------
echo ""
echo "=== Setup complete! ==="
echo ""
echo "  Next steps:"
echo "  1. Make sure your API key is in the .env file"
if [ -n "$EDITOR_CMD" ]; then
  echo "  2. Open this folder in your editor: ${EDITOR_CMD} ."
else
  echo "  2. Open this folder in VS Code or Cursor"
fi
echo "  3. Click the pen icon in the left sidebar"
echo "  4. Start writing!"
echo ""

if [ -n "$EDITOR_CMD" ]; then
  read -p "  Open the workspace now? (y/n) " OPEN_NOW
  if [[ "$OPEN_NOW" =~ ^[Yy]$ ]]; then
    "$EDITOR_CMD" "$PROJECT_ROOT"
  fi
fi
