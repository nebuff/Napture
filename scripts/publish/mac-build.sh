#!/usr/bin/env bash
# macOS (Apple Silicon) build for the collaborator who owns a Mac. Pulls the
# version bump, builds arm64 dmg + zip, and adds them to the same GitHub draft
# release that linux-win-build.sh created (or creates the draft if it is
# missing).
#
#   ./scripts/publish/mac-build.sh
#   ./scripts/publish/mac-build.sh --no-pull   # do not touch git
#
# Requires: Node.js 18+, Xcode command line tools (xcode-select --install),
# and the GitHub CLI signed in as a collaborator with write access.

set -euo pipefail
source "$(dirname -- "$0")/lib.sh"

usage() {
  cat <<'EOF'
Usage: mac-build.sh [options]

  --no-pull       Do not run git pull before building.
  --force         Upload into the release even if it is already published.
  -h, --help      Show this help.
EOF
}

PULL=1
ALLOW_PUBLISHED=0

for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    --force)   ALLOW_PUBLISHED=1 ;;
    -h|--help) usage; exit 0 ;;
    *)         die "unknown option: $arg (see --help)" ;;
  esac
done

[ "$(uname -s)" = "Darwin" ] || die "this script must run on macOS"
[ "$(uname -m)" = "arm64" ] || warn "not running on Apple Silicon; the build still targets arm64 (slow, via Rosetta)"

load_release
require_cmd node "Install Node.js 18+."
require_cmd npm "Install npm."
require_gh
SLUG="$(repo_slug)"

if [ "$PULL" -eq 1 ]; then
  if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
    warn "working tree is not clean; skipping git pull"
  elif git -C "$REPO_ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    step "Pulling the latest version changes"
    git -C "$REPO_ROOT" pull --ff-only
  else
    warn "current branch has no upstream; skipping git pull"
  fi
fi

CURRENT_VERSION="$(node -p "require('$REPO_ROOT/package.json').version")"
if [ "$CURRENT_VERSION" != "$VERSION" ]; then
  die "this checkout is $CURRENT_VERSION but the release is $VERSION.
       Run: git pull origin \$(git rev-parse --abbrev-ref HEAD)"
fi

cd "$REPO_ROOT"
if [ ! -d node_modules ]; then
  step "Installing dependencies"
  npm install
fi

# See linux-win-build.sh: keep 7-Zip below the default -mx=9 memory peak.
export ELECTRON_BUILDER_COMPRESSION_LEVEL="${ELECTRON_BUILDER_COMPRESSION_LEVEL:-6}"

step "Building macOS arm64 for $RELEASE_TITLE"
npx electron-builder --mac --arm64 --publish never

ensure_draft_release
upload_assets "macOS" "napture-$VERSION-arm64-macos.dmg" "napture-$VERSION-arm64-macos.zip" "latest-mac.yml"
print_release_link
