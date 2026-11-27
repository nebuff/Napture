const fs = require('fs');
const path = require('path');
const {
  GITHUB_RELEASES_URL,
  normalizeChannel,
  compareVersions,
  selectLatestRelease,
  selectUpdateAsset,
  buildUpdateCheckResult
} = require('../../napture/updater-core');

function makeRelease(version, options = {}) {
  const { prerelease = false, draft = false, assets = [], body = '' } = options;
  return {
    tag_name: `v${version}`,
    name: `Napture ${version}`,
    body,
    prerelease,
    draft,
    html_url: `https://github.com/nebuff/Napture/releases/tag/v${version}`,
    assets
  };
}

function asset(name) {
  return {
    name,
    size: 1024,
    browser_download_url: `https://github.com/nebuff/Napture/releases/download/v1/${name}`
  };
}

describe('updater-core version handling', () => {
  test('compares plain versions numerically, not lexically', () => {
    expect(compareVersions('0.23.0', '0.22.1')).toBe(1);
    expect(compareVersions('0.22.1', '0.22.1')).toBe(0);
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1);
    expect(compareVersions('v1.0.0', '1.0')).toBe(0);
  });

  test('orders pre-releases below their stable version', () => {
    expect(compareVersions('0.22.1-beta.1', '0.22.1')).toBe(-1);
    expect(compareVersions('0.22.1', '0.22.1-beta.9')).toBe(1);
    expect(compareVersions('0.22.1-beta.2', '0.22.1-beta.10')).toBe(-1);
    expect(compareVersions('0.23.0-beta.1', '0.22.1')).toBe(1);
  });

  test('normalises unknown channels to stable', () => {
    expect(normalizeChannel('beta')).toBe('beta');
    expect(normalizeChannel('BETA')).toBe('beta');
    expect(normalizeChannel('nightly')).toBe('stable');
    expect(normalizeChannel(undefined)).toBe('stable');
  });

  test('queries the GitHub releases API rather than the retired update domain', () => {
    expect(GITHUB_RELEASES_URL).toContain('api.github.com/repos/nebuff/Napture/releases');
    expect(GITHUB_RELEASES_URL).not.toContain('nebuff.xyz');
  });

  test('main process no longer talks to the old update server', () => {
    const mainSource = fs.readFileSync(path.resolve(__dirname, '../../napture/main.js'), 'utf8');
    expect(mainSource).not.toContain('updates.nebuff.xyz');
    expect(mainSource).toContain("require('./updater-core')");
  });
});

describe('updater-core channel selection', () => {
  const releases = [
    makeRelease('0.21.0'),
    makeRelease('0.22.1'),
    makeRelease('0.23.0-beta.1', { prerelease: true }),
    makeRelease('0.24.0-beta.2', { prerelease: true })
  ];

  test('stable channel only considers full releases', () => {
    const picked = selectLatestRelease(releases, { channel: 'stable', currentVersion: '0.22.1' });
    expect(picked).toBeNull();
  });

  test('stable channel offers a newer full release and ignores betas', () => {
    const picked = selectLatestRelease(releases, { channel: 'stable', currentVersion: '0.21.0' });
    expect(picked.version).toBe('0.22.1');
    expect(picked.prerelease).toBe(false);
  });

  test('beta channel picks the newest beta when it outranks stable', () => {
    const picked = selectLatestRelease(releases, { channel: 'beta', currentVersion: '0.22.1' });
    expect(picked.version).toBe('0.24.0-beta.2');
    expect(picked.prerelease).toBe(true);
  });

  test('beta channel falls back to a newer stable release when no newer beta exists', () => {
    const stableOnly = [
      makeRelease('0.22.1'),
      makeRelease('0.23.0'),
      makeRelease('0.23.0-beta.1', { prerelease: true })
    ];
    const picked = selectLatestRelease(stableOnly, { channel: 'beta', currentVersion: '0.22.1-beta.3' });
    expect(picked.version).toBe('0.23.0');
    expect(picked.prerelease).toBe(false);
  });

  test('ignores drafts and never offers the running version', () => {
    const list = [
      makeRelease('0.30.0', { draft: true }),
      makeRelease('0.23.0', { draft: true }),
      makeRelease('0.22.1')
    ];
    expect(selectLatestRelease(list, { channel: 'stable', currentVersion: '0.22.1' })).toBeNull();
  });
});

describe('updater-core asset selection', () => {
  const assets = [
    asset('napture-0.24.0-x64-windows.exe'),
    asset('napture-0.24.0-x64-linux.AppImage'),
    asset('napture-0.24.0-arm64-linux.tar.gz'),
    asset('napture-0.24.0-x64-macos.zip'),
    asset('napture-0.24.0-arm64-macos.dmg'),
    asset('latest-mac.yml')
  ];

  test('prefers a platform + arch zip when one exists', () => {
    const picked = selectUpdateAsset(assets, { platform: 'darwin', arch: 'x64' });
    expect(picked.name).toBe('napture-0.24.0-x64-macos.zip');
  });

  test('returns null when the release only ships installers', () => {
    expect(selectUpdateAsset(assets, { platform: 'win32', arch: 'x64' })).toBeNull();
    expect(selectUpdateAsset(assets, { platform: 'linux', arch: 'x64' })).toBeNull();
  });

  test('prefers a dedicated update bundle over a full app archive', () => {
    const bundleAssets = [
      asset('napture-0.24.0-x64-linux.tar.gz'),
      asset('napture-0.24.0-x64-linux-update.zip')
    ];
    const picked = selectUpdateAsset(bundleAssets, { platform: 'linux', arch: 'x64' });
    expect(picked.name).toBe('napture-0.24.0-x64-linux-update.zip');
  });
});

describe('updater-core check result', () => {
  test('reports the release page and marks the update manual when nothing is installable', () => {
    const result = buildUpdateCheckResult({
      releases: [makeRelease('0.23.0', { body: 'Bug fixes\nMore speed', assets: [asset('napture-0.23.0-x64-windows.exe')] })],
      channel: 'stable',
      currentVersion: '0.22.1',
      platform: 'win32',
      arch: 'x64'
    });

    expect(result.updateAvailable).toBe(true);
    expect(result.version).toBe('0.23.0');
    expect(result.manual).toBe(true);
    expect(result.download_url).toBeNull();
    expect(result.release_url).toContain('/releases/tag/v0.23.0');
    expect(result.release_notes).toContain('Bug fixes');
  });

  test('provides an absolute download url for an installable zip', () => {
    const result = buildUpdateCheckResult({
      releases: [makeRelease('0.23.0', { assets: [asset('napture-0.23.0-arm64-macos.zip')] })],
      channel: 'stable',
      currentVersion: '0.22.1',
      platform: 'darwin',
      arch: 'arm64'
    });

    expect(result.manual).toBe(false);
    expect(result.download_url).toMatch(/^https:\/\/github\.com\/.+\/releases\/download\//);
  });

  test('returns updateAvailable false when the channel has nothing newer', () => {
    const result = buildUpdateCheckResult({
      releases: [makeRelease('0.22.1')],
      channel: 'stable',
      currentVersion: '0.22.1',
      platform: 'linux',
      arch: 'x64'
    });

    expect(result).toEqual({ updateAvailable: false, channel: 'stable' });
  });
});
