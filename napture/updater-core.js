// Pure helpers for the GitHub Releases backed updater.
// Kept free of Electron/network side effects so release/channel selection stays testable.

const GITHUB_OWNER = 'nebuff';
const GITHUB_REPO_NAME = 'Napture';
const GITHUB_REPO = `${GITHUB_OWNER}/${GITHUB_REPO_NAME}`;
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`;
const GITHUB_RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`;

const CHANNELS = ['stable', 'beta'];

// Release asset name fragments used to match an OS / CPU architecture.
const OS_TOKENS = {
  win32: ['win', 'windows'],
  darwin: ['mac', 'macos', 'osx', 'darwin'],
  linux: ['linux']
};

function normalizeChannel(channel) {
  return String(channel || '').toLowerCase() === 'beta' ? 'beta' : 'stable';
}

function parseVersion(input) {
  if (input == null) return null;
  const raw = String(input).trim().replace(/^[vV]/, '');
  const match = raw.match(/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return {
    nums: match[1].split('.').map((part) => parseInt(part, 10) || 0),
    pre: match[2] ? match[2].split('.').filter(Boolean) : [],
    raw: match[1] + (match[2] ? `-${match[2]}` : '')
  };
}

function comparePrerelease(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  // A plain release outranks any pre-release of the same core version.
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;

    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      const diff = parseInt(left, 10) - parseInt(right, 10);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (left !== right) {
      return left > right ? 1 : -1;
    }
  }
  return 0;
}

/** Returns 1 when a > b, -1 when a < b, 0 when equal (semver ordering, leading `v` optional). */
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;

  const len = Math.max(left.nums.length, right.nums.length);
  for (let i = 0; i < len; i++) {
    const diff = (left.nums[i] || 0) - (right.nums[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return comparePrerelease(left.pre, right.pre);
}

function releaseVersion(release) {
  if (!release) return null;
  const parsed = parseVersion(release.tag_name || release.version || release.name);
  return parsed ? parsed.raw : null;
}

function isPrereleaseRelease(release) {
  if (!release) return false;
  if (release.prerelease === true) return true;
  const parsed = parseVersion(releaseVersion(release));
  return Boolean(parsed && parsed.pre.length > 0);
}

function formatReleaseNotes(body) {
  if (typeof body !== 'string') return '';
  const notes = body.replace(/\r\n/g, '\n').trim();
  return notes.length > 4000 ? `${notes.slice(0, 4000)}…` : notes;
}

function archTokens(arch) {
  const value = String(arch || '').toLowerCase();
  if (value.includes('arm64') || value.includes('aarch64') || value === 'arm') {
    return ['arm64', 'aarch64'];
  }
  return ['x64', 'amd64', 'x86_64', 'x86'];
}

function assetMatchesPlatform(asset, tokens) {
  const name = String((asset && asset.name) || '').toLowerCase();
  return tokens.some((token) => name.includes(token));
}

/**
 * Picks the newest release that the given channel is allowed to install.
 * `stable` only offers full releases; `beta` also offers pre-releases and still
 * falls back to a stable release when it is newer than the running build.
 */
function selectLatestRelease(releases, options = {}) {
  const channel = normalizeChannel(options.channel);
  const currentVersion = options.currentVersion;
  const list = Array.isArray(releases) ? releases : [];

  let best = null;
  let bestVersion = null;

  for (const release of list) {
    if (!release || release.draft) continue;
    if (channel === 'stable' && isPrereleaseRelease(release)) continue;

    const version = releaseVersion(release);
    if (!version) continue;
    if (currentVersion && compareVersions(version, currentVersion) <= 0) continue;

    if (!best || compareVersions(version, bestVersion) > 0) {
      best = release;
      bestVersion = version;
    }
  }

  if (!best) return null;
  return { release: best, version: bestVersion, prerelease: isPrereleaseRelease(best) };
}

/**
 * Selects a zip asset the in-place updater can extract for this OS/arch.
 * Returns null when the release only ships installers, so callers can point
 * the user at the release page instead of downloading something unusable.
 */
function selectUpdateAsset(assets, options = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const zips = list.filter((asset) => asset && typeof asset.name === 'string' && /\.zip$/i.test(asset.name));
  if (zips.length === 0) return null;

  const osTokens = OS_TOKENS[options.platform] || OS_TOKENS.linux;
  const archs = archTokens(options.arch);

  const exact = zips.filter((asset) => assetMatchesPlatform(asset, osTokens) && assetMatchesPlatform(asset, archs));
  const osOnly = zips.filter((asset) => assetMatchesPlatform(asset, osTokens));
  const pool = exact.length > 0 ? exact : osOnly;
  if (pool.length === 0) return null;

  // Prefer a dedicated update bundle over a full app archive when both exist.
  const bundles = pool.filter((asset) => /update/i.test(asset.name));
  return (bundles.length > 0 ? bundles : pool)[0];
}

/** Builds the IPC payload consumed by the settings page / startup check. */
function buildUpdateCheckResult(options = {}) {
  const channel = normalizeChannel(options.channel);
  const picked = selectLatestRelease(options.releases, {
    channel,
    currentVersion: options.currentVersion
  });

  if (!picked) {
    return { updateAvailable: false, channel };
  }

  const asset = selectUpdateAsset(picked.release.assets, {
    platform: options.platform,
    arch: options.arch
  });

  return {
    updateAvailable: true,
    channel,
    version: picked.version,
    tag: picked.release.tag_name || null,
    prerelease: picked.prerelease,
    release_notes: formatReleaseNotes(picked.release.body),
    release_url: picked.release.html_url || GITHUB_RELEASES_PAGE,
    download_url: asset ? asset.browser_download_url : null,
    download_size: asset && asset.size ? asset.size : null,
    manual: !asset
  };
}

module.exports = {
  GITHUB_REPO,
  GITHUB_RELEASES_URL,
  GITHUB_RELEASES_PAGE,
  CHANNELS,
  normalizeChannel,
  parseVersion,
  compareVersions,
  releaseVersion,
  isPrereleaseRelease,
  formatReleaseNotes,
  selectLatestRelease,
  selectUpdateAsset,
  buildUpdateCheckResult
};
