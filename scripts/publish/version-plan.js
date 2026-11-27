// Decides the package version, channel and git tag for a release bump.
//
// Pure so it can be unit tested without git, npm or a network. The rule it
// enforces: a stable release is a plain x.y.z and a beta always carries a
// pre-release suffix (x.y.z-beta.N). Two channels can therefore never ship the
// same version number, which matters because Linux package managers compare the
// metadata version:
//
//   electron-builder writes 0.23.0-beta.1 as 0.23.0~beta.1 for .deb/.rpm,
//   so it sorts below the 0.23.0 stable instead of looking like a new build
//   of the same 0.23.0 package.

'use strict';

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const STABLE_TAG_RE = /^(\d+\.\d+\.\d+)$/;
const BETA_LABEL_RE = /^beta(\.\d+)?$/;

class VersionPlanError extends Error {}

function stripV(value) {
  return String(value == null ? '' : value).trim().replace(/^[vV]/, '');
}

function parseCore(core) {
  return String(core).split('.').map((part) => parseInt(part, 10) || 0);
}

/** Compares two x.y.z cores: 1 when a > b, -1 when a < b, 0 when equal. */
function compareCore(a, b) {
  const left = parseCore(a);
  const right = parseCore(b);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** Newest plain x.y.z among the given tag names, as "x.y.z" (or null). */
function latestStableCore(tags) {
  let best = null;
  for (const tag of tags || []) {
    const match = stripV(tag).match(STABLE_TAG_RE);
    if (!match) continue;
    if (best === null || compareCore(match[1], best) > 0) best = match[1];
  }
  return best;
}

function nextPatch(core) {
  const [major, minor, patch] = parseCore(core);
  return `${major}.${minor}.${patch + 1}`;
}

/** How a version ends up in .deb/.rpm metadata (electron-builder's own rule). */
function toLinuxPackageVersion(version) {
  return String(version).replace(/-/g, '~');
}

/**
 * planVersion({ version, beta, stable, tags })
 *
 * Returns { version, core, prerelease, channel, tag, linuxVersion } or throws
 * VersionPlanError with a message explaining how to fix the argument.
 */
function planVersion(input = {}) {
  const raw = stripV(input.version);
  const match = raw.match(VERSION_RE);
  if (!match) {
    throw new VersionPlanError(
      `version must look like 0.23.1 or 0.23.0-beta.1 (got '${input.version}')`
    );
  }

  const core = `${match[1]}.${match[2]}.${match[3]}`;
  const prerelease = match[4] || null;
  const version = prerelease ? `${core}-${prerelease}` : core;

  if (input.beta && input.stable) {
    throw new VersionPlanError('--beta and --stable cannot be combined');
  }

  if (input.beta && !prerelease) {
    throw new VersionPlanError(
      `${core} is a plain version, so it cannot be a beta: it would ship the same ` +
        `version number as the stable ${core} and package managers could not tell ` +
        `them apart. Use ${nextPatch(core)}-beta.1 (or <next version>-beta.1).`
    );
  }

  if (input.stable && prerelease) {
    throw new VersionPlanError(
      `${version} carries a pre-release label, so it is a beta. Drop --stable, ` +
        `or use the plain number ${core} for a production release.`
    );
  }

  if (prerelease && !BETA_LABEL_RE.test(prerelease)) {
    throw new VersionPlanError(
      `beta pre-release label must be 'beta' or 'beta.<n>' (got '${prerelease}'); ` +
        `for example ${core}-beta.1`
    );
  }

  const tags = (input.tags || []).map(stripV);
  const tag = `v${version}`;
  if (tags.includes(version)) {
    throw new VersionPlanError(`tag ${tag} already exists on this repo; pick a new version`);
  }

  if (prerelease) {
    const stableCore = latestStableCore(tags);
    if (stableCore && compareCore(core, stableCore) <= 0) {
      throw new VersionPlanError(
        `${version} would not be newer than the stable ${stableCore} that is already ` +
          `tagged: package managers would read it as ${toLinuxPackageVersion(version)} ` +
          `and keep the stable install. Use a version above ${stableCore}, ` +
          `for example ${nextPatch(stableCore)}-beta.1.`
      );
    }
  }

  return {
    version,
    core,
    prerelease,
    channel: prerelease ? 'beta' : 'stable',
    tag,
    linuxVersion: toLinuxPackageVersion(version)
  };
}

module.exports = {
  VersionPlanError,
  planVersion,
  compareCore,
  latestStableCore,
  toLinuxPackageVersion,
  nextPatch
};

if (require.main === module) {
  const fs = require('fs');
  const argv = process.argv.slice(2);
  const input = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--version') input.version = argv[++i];
    else if (arg === '--beta') input.beta = true;
    else if (arg === '--stable') input.stable = true;
    else if (arg === '--tags-file') {
      const file = argv[++i];
      input.tags = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } else {
      process.stderr.write(`unknown argument: ${arg}\n`);
      process.exit(2);
    }
  }

  try {
    process.stdout.write(JSON.stringify(planVersion(input)));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
