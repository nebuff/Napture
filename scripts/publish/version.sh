#!/usr/bin/env bash
# Bumps the Napture version everywhere and records which channel the release is on.
#
#   ./scripts/publish/version.sh 0.23.1             # production
#   ./scripts/publish/version.sh 0.23.0-beta.1      # beta (tag v0.23.0-beta.1)
#   ./scripts/publish/version.sh 0.23.1 --no-push   # commit but do not push
#
# Betas always carry a pre-release suffix. Without one the beta would ship the
# same package version as the stable build and Linux package managers could not
# tell them apart; with one, electron-builder writes 0.23.0-beta.1 as
# 0.23.0~beta.1 for .deb/.rpm, which sorts below the 0.23.0 stable.
#
# Writes package.json, versions.json, napture/versions.json and
# scripts/publish/state.json, then commits and pushes. The tag itself is created
# by the release workflow (ci-publish.sh), not here.

set -euo pipefail
source "$(dirname -- "$0")/lib.sh"

usage() {
  cat <<'EOF'
Usage: version.sh <x.y.z|x.y.z-beta[.n]> [options]

  <x.y.z>         Production release (tag v<x.y.z>).
  <x.y.z-beta.n>  Beta release (tag v<x.y.z-beta.n>, GitHub prerelease).
                  A beta needs the suffix: a plain number would collide with
                  the stable build of that version in deb/rpm/snap metadata.
  --beta          Assert this is a beta (requires a -beta suffix).
  --stable        Assert this is production (rejects a -beta suffix).
  --no-push       Commit the bump but leave it local.
  --allow-dirty   Allow running with uncommitted (tracked) changes.
  -h, --help      Show this help.
EOF
}

NEW_VERSION=""
WANT_BETA=0
WANT_STABLE=0
PUSH=1
ALLOW_DIRTY=0

for arg in "$@"; do
  case "$arg" in
    --beta)        WANT_BETA=1 ;;
    --stable)      WANT_STABLE=1 ;;
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

cd "$REPO_ROOT"
require_cmd node "Install Node.js 18+."
require_cmd npm "Install npm."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Existing tags drive the checks: no duplicate tag, and a beta has to be newer
# than the newest stable so package managers see a real upgrade path.
git tag --list > "$TMP_DIR/tags"

PLAN_ARGS=(--version "$NEW_VERSION" --tags-file "$TMP_DIR/tags")
if [ "$WANT_BETA" -eq 1 ]; then PLAN_ARGS+=(--beta); fi
if [ "$WANT_STABLE" -eq 1 ]; then PLAN_ARGS+=(--stable); fi

if ! node "$PUBLISH_DIR/version-plan.js" "${PLAN_ARGS[@]}" > "$TMP_DIR/plan.json"; then
  exit 1
fi

FULL_VERSION="$(json_get "$TMP_DIR/plan.json" version)"
CHANNEL="$(json_get "$TMP_DIR/plan.json" channel)"
TAG="$(json_get "$TMP_DIR/plan.json" tag)"
LINUX_VERSION="$(json_get "$TMP_DIR/plan.json" linuxVersion)"

if [ "$ALLOW_DIRTY" -ne 1 ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git status --short
    die "working tree has uncommitted changes; commit or stash them first (or pass --allow-dirty)"
  fi
fi

if [ "$PUSH" -eq 1 ] && git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  die "tag $TAG already exists on origin; use a new version or delete that release first"
fi

step "Setting $FULL_VERSION on the $CHANNEL channel (tag $TAG)"
if [ "$CHANNEL" = "beta" ]; then
  info "deb/rpm metadata will read $LINUX_VERSION, so it sorts below the stable ${FULL_VERSION%%-*}"
fi

HAD_PACKAGE_LOCK=0
if [ -f package-lock.json ]; then HAD_PACKAGE_LOCK=1; fi
npm version "$FULL_VERSION" --no-git-tag-version --allow-same-version >/dev/null
# If no lockfile existed, npm version would create one; drop it again so the
# commit only contains the version files that already existed.
if [ "$HAD_PACKAGE_LOCK" -eq 0 ] && [ -f package-lock.json ]; then
  rm -f package-lock.json
  info "removed the package-lock.json npm generated (this repo has none)"
fi

node - "$FULL_VERSION" <<'NODE'
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

node - "$STATE_FILE" "$FULL_VERSION" "$CHANNEL" "$TAG" <<'NODE'
const fs = require('fs');
const [, , file, version, channel, tag] = process.argv;
fs.writeFileSync(file, JSON.stringify({ version, channel, tag }, null, 2) + '\n');
console.log(`  wrote ${file}`);
NODE

if [ "$CHANNEL" = "beta" ]; then COMMIT_MSG="Release $FULL_VERSION (beta)"; else COMMIT_MSG="Release $FULL_VERSION"; fi

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
printf '  1. Actions -> Release Draft -> Run workflow (platforms: all)\n'
printf '     builds the installers on the runners and uploads them into the draft\n'
if SLUG="$(repo_slug 2>/dev/null)"; then
  printf '  2. review and publish: https://github.com/%s/releases\n' "$SLUG"
else
  printf '  2. review and publish on your repository releases page\n'
fi
