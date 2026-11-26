#!/usr/bin/env bash
# Shared helpers for scripts/publish/*.sh. Source it, never run it directly.
# shellcheck shell=bash

set -euo pipefail

PUBLISH_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$PUBLISH_DIR/../.." && pwd)"
STATE_FILE="$PUBLISH_DIR/state.json"

if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_DIM=""; C_OFF=""
fi

die()  { printf '%serror:%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; exit 1; }
warn() { printf '%swarning:%s %s\n' "$C_YELLOW" "$C_OFF" "$*" >&2; }
info() { printf '%s%s%s\n' "$C_DIM" "$*" "$C_OFF"; }
step() { printf '\n%s==>%s %s\n' "$C_GREEN" "$C_OFF" "$*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing dependency '$1'. $2"
}

json_get() { # json_get <file> <key>
  node -e 'const fs=require("fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))[process.argv[2]];process.stdout.write(v===undefined?String(""):String(v));' "$1" "$2"
}

# Populates VERSION, CHANNEL, TAG and RELEASE_TITLE from scripts/publish/state.json.
load_release() {
  [ -f "$STATE_FILE" ] || die "no release state at ${STATE_FILE#"$REPO_ROOT"/}. Run scripts/publish/version.sh <version> first."
  VERSION="$(json_get "$STATE_FILE" version)"
  CHANNEL="$(json_get "$STATE_FILE" channel)"
  TAG="$(json_get "$STATE_FILE" tag)"
  [ -n "$VERSION" ] && [ -n "$TAG" ] || die "release state is incomplete: $STATE_FILE"
  if [ "$CHANNEL" != "beta" ]; then CHANNEL="stable"; fi
  RELEASE_TITLE="Napture $VERSION"
  if [ "$CHANNEL" = "beta" ]; then RELEASE_TITLE="Napture $VERSION Beta"; fi
}

repo_slug() { # prints owner/repo from the origin remote
  git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1 || die "$REPO_ROOT is not a git repository"
  local url
  url="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null)" || die "no 'origin' remote configured"
  url="${url%.git}"
  case "$url" in
    git@github.com:*)     printf '%s' "${url#git@github.com:}" ;;
    ssh://git@github.com/*) printf '%s' "${url#ssh://git@github.com/}" ;;
    https://github.com/*) printf '%s' "${url#https://github.com/}" ;;
    https://*@github.com/*) printf '%s' "${url##*github.com/}" ;;
    *) die "origin is not a GitHub remote: $url" ;;
  esac
}

require_gh() {
  require_cmd gh "Install the GitHub CLI: https://cli.github.com"
  gh auth status >/dev/null 2>&1 || die "gh is not signed in. Run: gh auth login"
}

release_is_draft() {
  local draft
  draft="$(gh release view "$TAG" --repo "$SLUG" --json isDraft --jq '.isDraft' 2>/dev/null)" || return 1
  [ "$draft" = "true" ]
}

# Creates the draft release for $TAG if it is missing, reuses it otherwise.
# Set ALLOW_PUBLISHED=1 to upload into an already published release.
ensure_draft_release() {
  if gh release view "$TAG" --repo "$SLUG" >/dev/null 2>&1; then
    if ! release_is_draft; then
      [ "${ALLOW_PUBLISHED:-0}" = "1" ] || die "release $TAG is already published. Re-run with --force to modify it."
    fi
    info "using existing release $TAG"
    return 0
  fi
  local -a args=(release create "$TAG" --repo "$SLUG" --draft --title "$RELEASE_TITLE"
                 --target "$(git -C "$REPO_ROOT" rev-parse HEAD)" --generate-notes)
  if [ "$CHANNEL" = "beta" ]; then args+=(--prerelease); fi
  step "Creating draft release $TAG"
  gh "${args[@]}"
}

# upload_assets <label> <glob>... — uploads matching dist/ files, replacing old ones.
upload_assets() {
  local label="$1"; shift
  local -a files=()
  local pattern file
  shopt -s nullglob
  for pattern in "$@"; do
    for file in "$REPO_ROOT"/dist/$pattern; do files+=("$file"); done
  done
  shopt -u nullglob
  ((${#files[@]})) || die "no $label artifacts in dist/ for $VERSION"
  step "Uploading ${#files[@]} $label asset(s) to $TAG"
  gh release upload "$TAG" "${files[@]}" --repo "$SLUG" --clobber
  printf '  %s\n' "${files[@]#"$REPO_ROOT"/}"
}

print_release_link() {
  printf '\n%s\n' "Draft: https://github.com/$SLUG/releases/edit/$TAG"
}
