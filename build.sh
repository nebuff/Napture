#!/usr/bin/env bash
# ==============================================================================
# Napture Desktop Browser - Universal Build & Packaging Script
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Text styles & colors
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_header() {
  echo -e "${BLUE}${BOLD}"
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║                   NAPTURE BROWSER BUILDER                  ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_help() {
  print_header
  echo -e "${BOLD}Usage:${NC} ./build.sh [target]"
  echo ""
  echo -e "${BOLD}Build Targets:${NC}"
  echo -e "  ${GREEN}(default)${NC}        Build installer / packages for the current OS"
  echo -e "  ${GREEN}--dir, -d${NC}        Fast unpack build (outputs directly to dist/ without compression)"
  echo -e "  ${GREEN}--linux, -l${NC}      Build Linux packages (.AppImage, .deb, .rpm, .tar.gz)"
  echo -e "  ${GREEN}--win, -w${NC}        Build Windows executables (NSIS installer, Portable)"
  echo -e "  ${GREEN}--mac, -m${NC}        Build macOS packages (.dmg, .zip)"
  echo -e "  ${GREEN}--all, -a${NC}        Build packages for all platforms (Windows, Linux, macOS)"
  echo -e "  ${GREEN}--test, -t${NC}       Run Jest test suite before building"
  echo -e "  ${GREEN}--help, -h${NC}       Show this help message"
  echo ""
  echo -e "${BOLD}Examples:${NC}"
  echo "  ./build.sh              # Build for current host operating system"
  echo "  ./build.sh --dir        # Quick developer unpack build"
  echo "  ./build.sh --linux      # Build Linux AppImage / Deb / Rpm"
  echo "  ./build.sh --test       # Run test suite only"
  echo ""
}

check_prerequisites() {
  if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}[ERROR] Node.js is not installed or not in PATH.${NC}"
    echo "Please install Node.js (v18+ recommended): https://nodejs.org/"
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}[ERROR] npm is not installed or not in PATH.${NC}"
    exit 1
  fi

  if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[!] node_modules not found. Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}[OK] Dependencies installed successfully.${NC}\n"
  fi
}

TARGET="${1:-current}"

case "$TARGET" in
  --help|-h|help)
    print_help
    exit 0
    ;;
  --test|-t|test)
    print_header
    check_prerequisites
    echo -e "${BLUE}[*] Running test suite...${NC}"
    npm test
    echo -e "${GREEN}[SUCCESS] All tests passed!${NC}"
    exit 0
    ;;
  --dir|-d|dir)
    print_header
    check_prerequisites
    echo -e "${BLUE}[*] Packaging unpacked application directory into dist/...${NC}"
    npx electron-builder --dir
    echo -e "\n${GREEN}[SUCCESS] Unpacked build finished in dist/${NC}"
    ;;
  --linux|-l|linux)
    print_header
    check_prerequisites
    echo -e "${BLUE}[*] Building Linux packages...${NC}"
    npm run dist:linux
    echo -e "\n${GREEN}[SUCCESS] Linux packages generated in dist/${NC}"
    ;;
  --win|-w|win|windows)
    print_header
    check_prerequisites
    echo -e "${BLUE}[*] Building Windows executables...${NC}"
    npm run dist:win
    echo -e "\n${GREEN}[SUCCESS] Windows binaries generated in dist/${NC}"
    ;;
  --mac|-m|mac|macos)
    print_header
    check_prerequisites
    echo -e "${BLUE}[*] Building macOS bundles...${NC}"
    npm run dist:mac
    echo -e "\n${GREEN}[SUCCESS] macOS bundles generated in dist/${NC}"
    ;;
  --all|-a|all)
    print_header
    check_prerequisites
    echo -e "${BLUE}[*] Building binaries for all supported platforms...${NC}"
    npm run dist:all
    echo -e "\n${GREEN}[SUCCESS] All platform packages generated in dist/${NC}"
    ;;
  current|*)
    print_header
    check_prerequisites
    echo -e "${BLUE}[*] Building standalone distribution for current host OS...${NC}"
    npx electron-builder
    echo -e "\n${GREEN}[SUCCESS] Build complete! Binaries located in dist/${NC}"
    ;;
esac
