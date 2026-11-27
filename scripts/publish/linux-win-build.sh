#!/usr/bin/env bash
# Builds the Windows and Linux installers on this machine and puts them in the
# GitHub draft release for the current version (scripts/publish/state.json).
#
#   ./scripts/publish/linux-win-build.sh            # both platforms
#   ./scripts/publish/linux-win-build.sh --no-win   # Linux only
#   ./scripts/publish/linux-win-build.sh --no-linux # Windows only
#
# Run scripts/publish/version.sh first.

set -euo pipefail
source "$(dirname -- "$0")/lib.sh"

usage() {
  cat <<'EOF'
Usage: linux-win-build.sh [options]

  --no-win        Skip the Windows installers.
  --no-linux      Skip the Linux packages.
  --force         Upload into the release even if it is already published.
  -h, --help      Show this help.
EOF
}

BUILD_WIN=1
BUILD_LINUX=1
ALLOW_PUBLISHED=0

for arg in "$@"; do
  case "$arg" in
    --no-win)   BUILD_WIN=0 ;;
    --no-linux) BUILD_LINUX=0 ;;
    --force)    ALLOW_PUBLISHED=1 ;;
    -h|--help)  usage; exit 0 ;;
    *)          die "unknown option: $arg (see --help)" ;;
  esac
done

[ "$BUILD_WIN" -eq 1 ] || [ "$BUILD_LINUX" -eq 1 ] || die "nothing to build: both --no-win and --no-linux given"
[ "$(uname -s)" = "Linux" ] || die "this script builds Windows + Linux packages and must run on Linux"

load_release
require_cmd node "Install Node.js 18+."
require_cmd npm "Install npm."
require_gh
SLUG="$(repo_slug)"

if [ "$BUILD_WIN" -eq 1 ] && ! command -v wine >/dev/null 2>&1; then
  die "Windows installers need Wine: electron-builder runs the NSIS uninstaller under it.
       Install it with: sudo dnf install wine
       Or build Linux only: $0 --no-linux"
fi

if [ "$BUILD_LINUX" -eq 1 ]; then
  # deb/rpm are packed by electron-builder's bundled fpm, a self-contained ruby
  # that still links libcrypt.so.1 (Fedora 40+ only ships it in libxcrypt-compat).
  if ! ldconfig -p 2>/dev/null | grep 'libcrypt\.so\.1' >/dev/null; then
    die "deb/rpm packaging needs libcrypt.so.1 for electron-builder's bundled fpm.
       Install it with: sudo dnf install libxcrypt-compat
       (Debian/Ubuntu: sudo apt-get install libcrypt1)"
  fi
  if ! command -v rpmbuild >/dev/null 2>&1; then
    die "rpm packaging shells out to rpmbuild.
       Install it with: sudo dnf install rpm-build
       (Debian/Ubuntu: sudo apt-get install rpm)"
  fi
fi

cd "$REPO_ROOT"
# electron-builder packs the NSIS and portable archives with -mx=9, which peaks
# around 800 MB of RAM per archive and gets OOM-killed on an 8 GB machine. 6 is
# a few percent larger and needs roughly a quarter of the memory.
export ELECTRON_BUILDER_COMPRESSION_LEVEL="${ELECTRON_BUILDER_COMPRESSION_LEVEL:-6}"

step "Building $RELEASE_TITLE on $(uname -s)"
if [ "$BUILD_WIN" -eq 1 ]; then
  npm run dist:win
fi
if [ "$BUILD_LINUX" -eq 1 ]; then
  npm run dist:linux
fi

ensure_draft_release
if [ "$BUILD_WIN" -eq 1 ]; then
  upload_assets "Windows" "napture-$VERSION-*-windows*.exe"
fi
if [ "$BUILD_LINUX" -eq 1 ]; then
  upload_assets "Linux" "napture-$VERSION-*-linux.AppImage" "napture-$VERSION-*-linux.tar.gz" \
    "napture-$VERSION-*-linux.deb" "napture-$VERSION-*-linux.rpm"
fi
print_release_link

printf '\nAdd the macOS arm64 build to this draft:\n'
printf '  tell the Mac collaborator to run ./scripts/publish/mac-build.sh\n'
