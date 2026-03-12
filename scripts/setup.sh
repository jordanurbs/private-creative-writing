#!/bin/bash
set -e

# ============================================================
# Creative Writer — Setup Script
# Run this once to set up your writing workspace.
# ============================================================

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BOLD}✦ Creative Writer Setup${NC}"
echo "  Setting up your private writing workspace..."
echo ""

# --------------------------------------------------
# 1. Check for Node.js
# --------------------------------------------------
echo -e "${BOLD}[1/5] Checking for Node.js...${NC}"
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  echo -e "  ${GREEN}✓${NC} Node.js ${NODE_VERSION} found"
else
  echo -e "  ${YELLOW}Node.js not found. Installing...${NC}"
  if command -v brew &> /dev/null; then
    brew install node
  elif command -v apt-get &> /dev/null; then
    sudo apt-get update && sudo apt-get install -y nodejs npm
  elif command -v dnf &> /dev/null; then
    sudo dnf install -y nodejs npm
  else
    echo -e "  ${RED}Cannot auto-install Node.js.${NC}"
    echo "  Please install it from: https://nodejs.org"
    exit 1
  fi
  echo -e "  ${GREEN}✓${NC} Node.js installed"
fi

# --------------------------------------------------
# 2. Check for VS Code or Cursor
# --------------------------------------------------
echo -e "${BOLD}[2/5] Checking for VS Code / Cursor...${NC}"
EDITOR_CMD=""
if command -v cursor &> /dev/null; then
  EDITOR_CMD="cursor"
  echo -e "  ${GREEN}✓${NC} Cursor found"
elif command -v code &> /dev/null; then
  EDITOR_CMD="code"
  echo -e "  ${GREEN}✓${NC} VS Code found"
else
  echo -e "  ${YELLOW}Neither VS Code nor Cursor CLI found.${NC}"
  echo "  The extension will be built but you'll need to install it manually."
  echo "  Install VS Code from: https://code.visualstudio.com"
fi

# --------------------------------------------------
# 3. Install dependencies and build the extension
# --------------------------------------------------
echo -e "${BOLD}[3/5] Building the Creative Writer extension...${NC}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$PROJECT_ROOT/extension"

cd "$EXTENSION_DIR"
npm install --silent 2>/dev/null
echo "  Dependencies installed"

npm run build 2>/dev/null
echo "  Extension compiled"

npx @vscode/vsce package --no-dependencies --no-git-tag-version 2>/dev/null
VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -1)
echo -e "  ${GREEN}✓${NC} Extension packaged: ${VSIX_FILE}"

# --------------------------------------------------
# 4. Install the extension
# --------------------------------------------------
echo -e "${BOLD}[4/5] Installing extension...${NC}"
if [ -n "$EDITOR_CMD" ] && [ -n "$VSIX_FILE" ]; then
  "$EDITOR_CMD" --install-extension "$VSIX_FILE" --force 2>/dev/null
  echo -e "  ${GREEN}✓${NC} Extension installed"
else
  echo -e "  ${YELLOW}Skipped (no editor CLI found). Install manually:${NC}"
  echo "  Open VS Code → Extensions → ⋯ → Install from VSIX → select extension/${VSIX_FILE}"
fi

# --------------------------------------------------
# 5. Set up the API key
# --------------------------------------------------
echo -e "${BOLD}[5/5] Setting up your Venice API key...${NC}"
cd "$PROJECT_ROOT"

if [ -f ".env" ]; then
  echo -e "  ${GREEN}✓${NC} .env file already exists"
else
  echo ""
  echo "  You need a Venice AI API key (it's free to start)."
  echo "  Get one at: https://venice.ai/settings/api"
  echo ""
  read -p "  Paste your API key here (or press Enter to skip): " API_KEY

  if [ -n "$API_KEY" ]; then
    echo "VENICE_API_KEY=${API_KEY}" > .env
    echo -e "  ${GREEN}✓${NC} API key saved to .env"
  else
    cp .env.example .env
    echo -e "  ${YELLOW}Skipped.${NC} Edit the .env file later to add your key."
  fi
fi

# --------------------------------------------------
# 6. Create notes directory
# --------------------------------------------------
if [ ! -d "notes" ]; then
  mkdir -p notes
  cat > notes/scratch-pad.md << 'NOTES'
# Scratch Pad

Jot down anything here -- ideas, fragments, reminders, research links, things you overheard on the bus. This file isn't tied to any project. It's just for you.

---


NOTES
  echo -e "  ${GREEN}✓${NC} notes/ directory created"
fi

# --------------------------------------------------
# Done!
# --------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}✦ Setup complete!${NC}"
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
