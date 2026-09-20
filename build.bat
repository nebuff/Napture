@echo off
REM ==============================================================================
REM Napture Desktop Browser - Windows Build Script
REM ==============================================================================

echo ======================================================
echo           NAPTURE BROWSER BUILDER (WINDOWS)
echo ======================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    echo Please install Node.js from https://nodejs.org/
    exit /b 1
)

if not exist "node_modules" (
    echo [!] Installing dependencies...
    call npm install
)

if "%1"=="--test" (
    echo [*] Running test suite...
    call npm test
    exit /b %errorlevel%
)

if "%1"=="--dir" (
    echo [*] Building unpacked application directory...
    call npx electron-builder --dir
    echo [SUCCESS] Build complete in dist\
    exit /b 0
)

if "%1"=="--all" (
    echo [*] Building for all architectures...
    call npm run dist:all
    echo [SUCCESS] Build complete in dist\
    exit /b 0
)

echo [*] Building Windows installer and portable packages...
call npm run dist:win
echo.
echo [SUCCESS] Build complete! Binaries located in dist\
