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
 * Selects a dedicated update bundle the in-place updater can extract for this
 * OS/arch. Returns null when the release only ships installers, so callers can
 * point the user at the release page instead of downloading something unusable.
 *
 * Only `*-update.zip` counts: macOS also publishes a .zip, but that one is the
 * full `.app` bundle, and extracting it over resources/ would wreck the install.
 */
function selectUpdateAsset(assets, options = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const zips = list.filter((asset) => asset && typeof asset.name === 'string' && /-update\.zip$/i.test(asset.name));
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

// When a platform has no in-place update bundle the user still needs a real
// package. These patterns pick the most useful one out of a release's assets.
const DOWNLOAD_PREFERENCES = {
  win32: [/^(?!.*portable).*\.exe$/, /\.exe$/],
  darwin: [/\.dmg$/, /\.pkg$/, /\.zip$/],
  linux: [/\.appimage$/, /\.tar\.gz$/, /\.deb$/, /\.rpm$/]
};

// The download has to match how Napture was installed: an AppImage does not
// replace an rpm/deb package, and a portable .exe does not upgrade an NSIS
// install. `installKind` is detected by the main process (APPIMAGE/SNAP env,
// the package manager that owns the binary, electron-builder's portable vars).
// An empty list means "this build is updated elsewhere" (snap/flatpak stores).
const INSTALL_KIND_PREFERENCES = {
  appimage: [/\.appimage$/],
  tar: [/\.tar\.gz$/],
  deb: [/\.deb$/],
  rpm: [/\.rpm$/],
  sandbox: [],
  nsis: [/^(?!.*portable).*\.exe$/],
  portable: [/portable\.exe$/, /\.exe$/]
};

/**
 * Selects the best published package to hand to someone who has to install an
 * update by hand. Returns null when the release ships nothing for this OS, or
 * nothing in the format the running copy was installed with.
 */
function selectDownloadAsset(assets, options = {}) {
  const list = (Array.isArray(assets) ? assets : []).filter(
    (asset) => asset && typeof asset.name === 'string' && !/\.(ya?ml|blockmap)$/i.test(asset.name)
  );
  const osTokens = OS_TOKENS[options.platform] || OS_TOKENS.linux;
  const archs = archTokens(options.arch);

  const forOs = list.filter((asset) => assetMatchesPlatform(asset, osTokens));
  const forArch = forOs.filter((asset) => assetMatchesPlatform(asset, archs));
  const pool = forArch.length > 0 ? forArch : forOs;
  if (pool.length === 0) return null;

  const preferences = DOWNLOAD_PREFERENCES[options.platform] || DOWNLOAD_PREFERENCES.linux;
  const installPreferences = INSTALL_KIND_PREFERENCES[options.installKind];
  // A detected install format is a hard requirement: falling back to another
  // format would just repeat the download that could not replace the install.
  const patterns = installPreferences || preferences;
  for (const pattern of patterns) {
    const match = pool.find((asset) => pattern.test(asset.name.toLowerCase()));
    if (match) return match;
  }
  return null;
}

/**
 * What Napture can do with the selected package:
 *   extract   - unzip a dedicated update bundle over the app directory
 *   appimage  - replace the running AppImage and relaunch (no root needed)
 *   portable  - replace the portable .exe and relaunch
 *   installer - download and launch the platform installer/upgrader
 *   manual    - hand the package to the user / release page
 */
function resolveInstallAction(options, asset, installer) {
  if (asset) return 'extract';
  if (!installer) return 'manual';
  const name = String(installer.name || '').toLowerCase();
  if (options.platform === 'linux' && options.installKind === 'appimage' && name.endsWith('.appimage')) {
    return 'appimage';
  }
  if (options.platform === 'win32' && name.endsWith('.exe')) {
    // Only replace the file when the release really ships a portable build;
    // otherwise launch the NSIS installer instead of overwriting the exe with
    // a totally different kind of binary.
    if (options.installKind === 'portable' && name.includes('portable')) return 'portable';
    return 'installer';
  }
  return 'manual';
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
  const installer = asset ? null : selectDownloadAsset(picked.release.assets, {
    platform: options.platform,
    arch: options.arch,
    installKind: options.installKind
  });

  const installAction = resolveInstallAction(options, asset, installer);
  const autoInstall = installAction !== 'manual';

  return {
    updateAvailable: true,
    channel,
    version: picked.version,
    tag: picked.release.tag_name || null,
    prerelease: picked.prerelease,
    release_notes: formatReleaseNotes(picked.release.body),
    release_url: picked.release.html_url || GITHUB_RELEASES_PAGE,
    // The file install-update downloads: an update bundle when one exists,
    // otherwise the installer/package this copy can actually be upgraded with.
    download_url: asset
      ? asset.browser_download_url
      : (autoInstall && installer ? installer.browser_download_url : null),
    download_size: asset && asset.size ? asset.size : null,
    // Set when only a manual install is possible: the package the user should
    // actually download for this OS/arch, not just a link to the release list.
    installer_url: installer ? installer.browser_download_url : null,
    installer_name: installer ? installer.name : null,
    install_action: installAction,
    manual: !autoInstall
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
  selectDownloadAsset,
  resolveInstallAction,
  INSTALL_KIND_PREFERENCES,
  buildUpdateCheckResult
};
