# Napture Browser

<div align="center">

**A modern, lightweight, and privacy-focused desktop web browser.**

[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-blue.svg)](https://github.com/nebuff/napture)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

---

## Overview

**Napture** is a cross-platform web browser built with Electron and Chromium. Designed from the ground up for speed, visual clarity, and customization, Napture offers a responsive interface, built-in tracker protection, flexible theme customization, and an extensible architecture.

---

## Features

- **Modern & Minimalist UI** – Sleek, streamlined interface with customizable omnibar, sidebar widgets, and glassmorphism accents.
- **Built-in Privacy & Content Blocking** – Automatic blocking of third-party tracking scripts, ads, and telemetry requests.
- **Custom Protocol Handlers** – Internal scheme routing for `napture://` (settings, history, downloads, bookmarks) and `ne://` namespaces.
- **End-to-End Encrypted Sync** – Secure synchronization of preferences, bookmarks, and pinned sites.
- **Tab & Session Management** – Multi-tab workspace with session restore, tab previews, and memory-saving hibernation.
- **Cross-Platform Compatibility** – Native packaging support for Linux (AppImage, Deb, Rpm, Flatpak, Snap), Windows (Installer & Portable), and macOS (Apple Silicon & Intel).

---

## Prerequisites

Before running or building Napture, make sure you have installed:

- **Node.js**: v18.x or higher (LTS recommended)
- **npm**: v9.x or higher (comes with Node.js)
- **Git**

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/nebuff/napture.git
cd napture
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm start
```

---

## Building Executables

Napture includes a universal build script (`build.sh` on Linux/macOS or `build.bat` on Windows) as well as standard npm build scripts.

### Using the Universal Build Script

```bash
# Build standalone packages for your current operating system:
./build.sh

# Fast unpack build for testing (outputs directly to dist/ without compression):
./build.sh --dir

# Build for specific platforms:
./build.sh --linux      # Generates .AppImage, .deb, .rpm, .tar.gz
./build.sh --win        # Generates Windows NSIS installer & Portable exe
./build.sh --mac        # Generates macOS .dmg & .zip bundles
./build.sh --all        # Builds for all platforms

# Run the test suite:
./build.sh --test
```

### Windows (Command Prompt / PowerShell)

```bat
:: Build for current environment:
build.bat

:: Quick unpacked test build:
build.bat --dir
```

### Using npm Scripts Directly

| Command | Description |
| :--- | :--- |
| `npm start` | Launch the browser locally in development mode |
| `npm test` | Run the complete Jest test suite |
| `npm run pack` | Build unpacked application into `dist/` |
| `npm run dist` | Build installers for current host platform |
| `npm run dist:linux` | Build Linux packages (`.AppImage`, `.deb`, `.rpm`, `.tar.gz`) |
| `npm run dist:win` | Build Windows executables (`.exe` installer & portable) |
| `npm run dist:mac` | Build macOS bundles (`.dmg` & `.zip`) |
| `npm run dist:all` | Build all platform targets |

All generated packages and binaries are output to the `dist/` folder.

---

## Running Tests

Napture includes a comprehensive Jest test suite covering UI components, database operations, protocol routing, and security policies:

```bash
npm test
```

---

## Project Structure

```
Napture/
├── napture/                  # Core application source code
│   ├── main.js               # Main process & window lifecycle manager
│   ├── preload.js            # Secure IPC bridge for renderer contexts
│   ├── tab-preload.js        # Webview tab isolation & content injection
│   ├── protocol-handler.js   # Internal napture:// scheme routing
│   ├── settings-ui.js        # Browser settings page controller
│   ├── history-ui.js         # History management & search interface
│   ├── downloads-ui.js       # Downloads manager & file shelf
│   ├── db/                   # SQLite database (history, settings, sync)
│   ├── newebx/               # UI styling & chrome customizations
│   ├── renderer/             # Webview components, tab bar & omnibar
│   ├── src/                  # Native bindings, components & telemetry
│   └── styles/               # Design system & theme stylesheets
├── scripts/                  # Packaging and build automation scripts
├── tests/                    # Jest automated test suites
├── build.sh                  # Universal build automation script
├── build.bat                 # Windows build script
├── package.json              # Project dependencies & metadata
└── versions.json             # Engine and browser version constants
```

---

## Configuration

Napture can be customized via environment variables. Copy `.env.example` to `.env` to override defaults:

```bash
cp .env.example .env
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NAPTURE_CHANNEL` | Release channel tag (`stable`, `beta`, `nightly`) | `stable` |
| `TELEMETRY_ENDPOINT` | Custom telemetry ingestion endpoint | None |
| `SYNC_SERVER_URL` | Custom E2EE sync server URL | Default |

---


## License

Distributed under the MIT License. See `LICENSE` for more information.
