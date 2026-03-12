@echo off
setlocal enabledelayedexpansion

echo.
echo === Creative Writer Setup ===
echo Setting up your private writing workspace...
echo.

:: --------------------------------------------------
:: 1. Check for Node.js
:: --------------------------------------------------
echo [1/5] Checking for Node.js...
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    for /f "tokens=*" %%v in ('node -v') do echo   Found Node.js %%v
) else (
    echo   Node.js not found.
    echo   Attempting to install via winget...
    where winget >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        winget install OpenJS.NodeJS.LTS --silent
        echo   Node.js installed. You may need to restart this terminal.
    ) else (
        echo   Cannot auto-install Node.js.
        echo   Please install it from: https://nodejs.org
        pause
        exit /b 1
    )
)

:: --------------------------------------------------
:: 2. Check for VS Code or Cursor
:: --------------------------------------------------
echo [2/5] Checking for VS Code / Cursor...
set EDITOR_CMD=
where cursor >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set EDITOR_CMD=cursor
    echo   Cursor found
) else (
    where code >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set EDITOR_CMD=code
        echo   VS Code found
    ) else (
        echo   No editor CLI found. Extension will be built for manual install.
    )
)

:: --------------------------------------------------
:: 3. Build the extension
:: --------------------------------------------------
echo [3/5] Building the Creative Writer extension...
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
set EXTENSION_DIR=%PROJECT_ROOT%\extension

cd /d "%EXTENSION_DIR%"
call npm install --silent 2>nul
echo   Dependencies installed

call npm run build 2>nul
echo   Extension compiled

call npx @vscode/vsce package --no-dependencies --no-git-tag-version 2>nul
for /f "tokens=*" %%f in ('dir /b /o-d *.vsix 2^>nul') do (
    set VSIX_FILE=%%f
    goto :found_vsix
)
:found_vsix
echo   Extension packaged: %VSIX_FILE%

:: --------------------------------------------------
:: 4. Install the extension
:: --------------------------------------------------
echo [4/5] Installing extension...
if defined EDITOR_CMD (
    if defined VSIX_FILE (
        %EDITOR_CMD% --install-extension "%VSIX_FILE%" --force 2>nul
        echo   Extension installed
    )
) else (
    echo   Skipped. Install manually: Extensions menu, Install from VSIX
)

:: --------------------------------------------------
:: 5. Set up API key
:: --------------------------------------------------
echo [5/5] Setting up your Venice API key...
cd /d "%PROJECT_ROOT%"

if exist ".env" (
    echo   .env file already exists
) else (
    echo.
    echo   You need a Venice AI API key (free to start).
    echo   Get one at: https://venice.ai/settings/api
    echo.
    set /p API_KEY="  Paste your API key here (or press Enter to skip): "
    if defined API_KEY (
        echo VENICE_API_KEY=!API_KEY!> .env
        echo   API key saved
    ) else (
        copy .env.example .env >nul
        echo   Skipped. Edit .env later to add your key.
    )
)

:: --------------------------------------------------
:: 6. Create notes directory
:: --------------------------------------------------
if not exist "notes" (
    mkdir notes
    (
        echo # Scratch Pad
        echo.
        echo Jot down anything here -- ideas, fragments, reminders, research links, things you overheard on the bus. This file isn't tied to any project. It's just for you.
        echo.
        echo ---
        echo.
    ) > notes\scratch-pad.md
    echo   notes/ directory created
)

:: --------------------------------------------------
:: Done
:: --------------------------------------------------
echo.
echo === Setup complete! ===
echo.
echo   Next steps:
echo   1. Make sure your API key is in the .env file
echo   2. Open this folder in VS Code or Cursor
echo   3. Click the pen icon in the left sidebar
echo   4. Start writing!
echo.

if defined EDITOR_CMD (
    set /p OPEN_NOW="  Open the workspace now? (y/n) "
    if /i "!OPEN_NOW!"=="y" (
        %EDITOR_CMD% "%PROJECT_ROOT%"
    )
)

pause
