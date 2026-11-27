#!/usr/bin/env bash
# CI half of the release flow: makes sure the GitHub draft release described by
# scripts/publish/state.json exists, then uploads one platform's installers into
# it.
#
#   ./scripts/publish/ci-publish.sh --ensure-only     # create/find the draft
#   ./scripts/publish/ci-publish.sh windows|linux|macos
#
# Needs GH_TOKEN (or a signed-in `gh`) and dist/ already populated by
# `npm run dist:<platform>`. Set ALLOW_PUBLISHED=1 to upload into a release that
# is already published instead of refusing.

set -euo pipefail
source "$(dirname -- "$0")/lib.sh"

TARGET="${1:-}"
case "$TARGET" in
  --ensure-only|windows|linux|macos) ;;
  *) die "usage: ci-publish.sh --ensure-only|windows|linux|macos" ;;
esac

load_release
require_gh
SLUG="$(repo_slug)"

# Read the version through the working directory rather than an absolute path:
# under Git Bash on the Windows runners $REPO_ROOT is a POSIX path (/d/a/...)
# that native Node cannot resolve, so `require('$REPO_ROOT/package.json')` died
# with MODULE_NOT_FOUND.
CURRENT_VERSION="$(cd "$REPO_ROOT" && node -p "require('./package.json').version")"
if [ "$CURRENT_VERSION" != "$VERSION" ]; then
  die "this checkout is $CURRENT_VERSION but scripts/publish/state.json says $VERSION.
       Run scripts/publish/version.sh $VERSION, push it, then dispatch the workflow from that commit."
fi

ensure_draft_release

if [ "$TARGET" != "--ensure-only" ]; then
  case "$TARGET" in
    windows)
      upload_assets "Windows" "napture-$VERSION-*-windows*.exe"
      ;;
    linux)
      upload_assets "Linux" "napture-$VERSION-*-linux.AppImage" "napture-$VERSION-*-linux.tar.gz" \
        "napture-$VERSION-*-linux.deb" "napture-$VERSION-*-linux.rpm"
      ;;
    macos)
      upload_assets "macOS" "napture-$VERSION-*-macos.dmg" "napture-$VERSION-*-macos.zip"
      # electron-builder only writes this when it can generate update metadata.
      if [ -f "$REPO_ROOT/dist/latest-mac.yml" ]; then
        upload_assets "macOS update metadata" "latest-mac.yml"
      fi
      ;;
  esac
fi

print_release_link
