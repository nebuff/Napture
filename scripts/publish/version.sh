#!/usr/bin/env bash
# Bumps the Napture version everywhere and records which channel the release is on.
#
#   ./scripts/publish/version.sh 0.23.1            # production
#   ./scripts/publish/version.sh 0.23.1 --beta     # beta (tag v0.23.1-beta)
#   ./scripts/publish/version.sh 0.23.1 --no-push  # commit but do not push
#
# Writes package.json, versions.json, napture/versions.json and
# scripts/publish/state.json, then commits and pushes. The tag itself is created
# by the release script (linux-win-build.sh / mac-build.sh), not here.

set -euo pipefail
source "$(dirname -- "$0")/lib.sh"

usage() {
  cat <<'EOF'
Usage: version.sh <x.y.z> [options]

  --beta          Mark this release as a beta (tag v<x.y.z>-beta, GitHub prerelease).
  --stable        Explicitly mark it as production (default).
  --no-push       Commit the bump but leave it local.
  --allow-dirty   Allow running with uncommitted (tracked) changes.
  -h, --help      Show this help.
EOF
}

NEW_VERSION=""
CHANNEL="stable"
PUSH=1
ALLOW_DIRTY=0

for arg in "$@"; do
  case "$arg" in
    --beta)        CHANNEL="beta" ;;
    --stable)      CHANNEL="stable" ;;
    --no-push)     PUSH=0 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    -h|--help)     usage; exit 0 ;;
    -*)            die "unknown option: $arg (see --help)" ;;
    *)             [ -z "$NEW_VERSION" ] || die "unexpected extra argument: $arg"; NEW_VERSION="$arg" ;;
  esac
done

if [ -z "$NEW_VERSION" ]; then
  usage >&2
  exit 1
fi
[[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || die "version must look like 0.23.1 (got '$NEW_VERSION'); beta is a channel, not part of the number"

cd "$REPO_ROOT"
require_cmd node "Install Node.js 18+."
require_cmd npm "Install npm."

TAG="v$NEW_VERSION"
if [ "$CHANNEL" = "beta" ]; then TAG="v$NEW_VERSION-beta"; fi

if [ "$ALLOW_DIRTY" -ne 1 ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git status --short
    die "working tree has uncommitted changes; commit or stash them first (or pass --allow-dirty)"
  fi
fi

if [ "$PUSH" -eq 1 ] && git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  die "tag $TAG already exists on origin; use a new version or delete that release first"
fi

step "Setting $NEW_VERSION on the $CHANNEL channel (tag $TAG)"
HAD_PACKAGE_LOCK=0
if [ -f package-lock.json ]; then HAD_PACKAGE_LOCK=1; fi
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version >/dev/null
# If no lockfile existed, npm version would create one; drop it again so the
# commit only contains the version files that already existed.
if [ "$HAD_PACKAGE_LOCK" -eq 0 ] && [ -f package-lock.json ]; then
  rm -f package-lock.json
  info "removed the package-lock.json npm generated (this repo has none)"
fi

node - "$NEW_VERSION" <<'NODE'
const fs = require('fs');
const version = process.argv[2];
for (const file of ['versions.json', 'napture/versions.json']) {
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.napture = version;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`  updated ${file}`);
}
NODE

node - "$STATE_FILE" "$NEW_VERSION" "$CHANNEL" "$TAG" <<'NODE'
const fs = require('fs');
const [, , file, version, channel, tag] = process.argv;
fs.writeFileSync(file, JSON.stringify({ version, channel, tag }, null, 2) + '\n');
console.log(`  wrote ${file}`);
NODE

if [ "$CHANNEL" = "beta" ]; then COMMIT_MSG="Release $NEW_VERSION (beta)"; else COMMIT_MSG="Release $NEW_VERSION"; fi

step "Committing"
git add package.json versions.json napture/versions.json "$STATE_FILE"
if [ -f package-lock.json ]; then git add package-lock.json; fi
if git diff --cached --quiet; then
  info "nothing to commit"
else
  git commit -q -m "$COMMIT_MSG"
  info "$(git log -1 --pretty='%h %s')"
fi

if [ "$PUSH" -eq 1 ]; then
  step "Pushing to origin"
  git push origin HEAD
else
  info "skipping push (--no-push)"
fi

printf '\nNext steps:\n'
printf '  1. ./scripts/publish/linux-win-build.sh          # Windows + Linux into the draft\n'
printf '  2. ask the Mac collaborator to run ./scripts/publish/mac-build.sh\n'
if SLUG="$(repo_slug 2>/dev/null)"; then
  printf '  3. review and publish: https://github.com/%s/releases\n' "$SLUG"
else
  printf '  3. review and publish on your repository releases page\n'
fi
