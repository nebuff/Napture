const fs = require('fs');
const path = require('path');
const {
  GITHUB_RELEASES_URL,
  normalizeChannel,
  compareVersions,
  selectLatestRelease,
  selectUpdateAsset,
  selectDownloadAsset,
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

  test('prefers a platform + arch update bundle when one exists', () => {
    const withBundle = assets.concat(asset('napture-0.24.0-x64-macos-update.zip'));
    const picked = selectUpdateAsset(withBundle, { platform: 'darwin', arch: 'x64' });
    expect(picked.name).toBe('napture-0.24.0-x64-macos-update.zip');
  });

  test('never treats the full macOS .app zip as an in-place update bundle', () => {
    // The macOS zip is the .app bundle; extracting it over resources/ would
    // wreck the install, so it must stay a manual download.
    expect(selectUpdateAsset(assets, { platform: 'darwin', arch: 'x64' })).toBeNull();
  });

  test('returns null when the release only ships installers', () => {
    expect(selectUpdateAsset(assets, { platform: 'win32', arch: 'x64' })).toBeNull();
    expect(selectUpdateAsset(assets, { platform: 'linux', arch: 'x64' })).toBeNull();
  });

  test('falls back to a real installer so manual updates are not a dead end', () => {
    const linux = [
      asset('napture-0.24.0-x86_64-linux.AppImage'),
      asset('napture-0.24.0-amd64-linux.deb'),
      asset('napture-0.24.0-x86_64-linux.rpm'),
      asset('napture-0.24.0-x64-linux.tar.gz'),
      asset('latest-mac.yml')
    ];
    expect(selectDownloadAsset(linux, { platform: 'linux', arch: 'x64' }).name)
      .toBe('napture-0.24.0-x86_64-linux.AppImage');

    const arm = [
      asset('napture-0.24.0-x86_64-linux.AppImage'),
      asset('napture-0.24.0-arm64-linux.AppImage')
    ];
    expect(selectDownloadAsset(arm, { platform: 'linux', arch: 'arm64' }).name)
      .toBe('napture-0.24.0-arm64-linux.AppImage');
  });

  test('prefers the package format the Linux copy was installed with', () => {
    const linux = [
      asset('napture-0.24.0-x86_64-linux.AppImage'),
      asset('napture-0.24.0-amd64-linux.deb'),
      asset('napture-0.24.0-x86_64-linux.rpm'),
      asset('napture-0.24.0-x64-linux.tar.gz')
    ];
    expect(selectDownloadAsset(linux, { platform: 'linux', arch: 'x64', installKind: 'rpm' }).name)
      .toBe('napture-0.24.0-x86_64-linux.rpm');
    expect(selectDownloadAsset(linux, { platform: 'linux', arch: 'x64', installKind: 'deb' }).name)
      .toBe('napture-0.24.0-amd64-linux.deb');
    expect(selectDownloadAsset(linux, { platform: 'linux', arch: 'x64', installKind: 'appimage' }).name)
      .toBe('napture-0.24.0-x86_64-linux.AppImage');
    expect(selectDownloadAsset(linux, { platform: 'linux', arch: 'x64', installKind: 'tar' }).name)
      .toBe('napture-0.24.0-x64-linux.tar.gz');
  });

  test('never hands an rpm install a package of another format', () => {
    const linux = [
      asset('napture-0.24.0-x86_64-linux.AppImage'),
      asset('napture-0.24.0-amd64-linux.deb')
    ];
    // Falling back to the AppImage is what made rpm/deb updates do nothing.
    expect(selectDownloadAsset(linux, { platform: 'linux', arch: 'x64', installKind: 'rpm' })).toBeNull();
    // Without a detected install kind the generic preference order still applies.
    expect(selectDownloadAsset(linux, { platform: 'linux', arch: 'x64' }).name)
      .toBe('napture-0.24.0-x86_64-linux.AppImage');
  });

  test('prefers the Windows installer over the portable build', () => {
    const windows = [
      asset('napture-0.24.0-x64-windows-portable.exe'),
      asset('napture-0.24.0-x64-windows.exe'),
      asset('napture-0.24.0-x64-windows.exe.blockmap')
    ];
    expect(selectDownloadAsset(windows, { platform: 'win32', arch: 'x64' }).name)
      .toBe('napture-0.24.0-x64-windows.exe');
  });

  test('picks the macOS dmg and returns null when nothing matches the platform', () => {
    expect(selectDownloadAsset(assets, { platform: 'darwin', arch: 'arm64' }).name)
      .toBe('napture-0.24.0-arm64-macos.dmg');
    expect(selectDownloadAsset([asset('latest-mac.yml')], { platform: 'linux', arch: 'x64' })).toBeNull();
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

// One release carrying every artifact the build publishes, per platform + arch.
const PLATFORM_ASSETS = [
  asset('napture-0.24.0-x64-windows.exe'),
  asset('napture-0.24.0-x64-windows-portable.exe'),
  asset('napture-0.24.0-arm64-windows.exe'),
  asset('napture-0.24.0-x64-macos.dmg'),
  asset('napture-0.24.0-arm64-macos.dmg'),
  asset('napture-0.24.0-x64-macos.zip'),
  asset('napture-0.24.0-x86_64-linux.AppImage'),
  asset('napture-0.24.0-arm64-linux.AppImage'),
  asset('napture-0.24.0-amd64-linux.deb'),
  asset('napture-0.24.0-x86_64-linux.rpm'),
  asset('napture-0.24.0-arm64-linux.rpm'),
  asset('napture-0.24.0-x64-linux.tar.gz'),
  asset('latest-mac.yml')
];

describe('updater-core check result', () => {
  test('reports the release page and marks the update manual when nothing is installable', () => {
    const result = buildUpdateCheckResult({
      releases: [makeRelease('0.23.0', { body: 'Bug fixes\nMore speed', assets: [asset('napture-0.23.0-x64-windows.exe')] })],
      channel: 'stable',
      currentVersion: '0.22.1',
      platform: 'linux',
      arch: 'x64',
      installKind: 'rpm'
    });

    expect(result.updateAvailable).toBe(true);
    expect(result.version).toBe('0.23.0');
    expect(result.manual).toBe(true);
    expect(result.install_action).toBe('manual');
    expect(result.download_url).toBeNull();
    expect(result.release_url).toContain('/releases/tag/v0.23.0');
    expect(result.release_notes).toContain('Bug fixes');
    expect(result.installer_name).toBeNull();
  });

  test('reports the installer that matches a detected rpm install', () => {
    const result = buildUpdateCheckResult({
      releases: [makeRelease('0.23.0', {
        assets: [
          asset('napture-0.23.0-x86_64-linux.AppImage'),
          asset('napture-0.23.0-x86_64-linux.rpm')
        ]
      })],
      channel: 'stable',
      currentVersion: '0.22.1',
      platform: 'linux',
      arch: 'x64',
      installKind: 'rpm'
    });

    expect(result.manual).toBe(true);
    expect(result.installer_name).toBe('napture-0.23.0-x86_64-linux.rpm');
    expect(result.installer_url).toContain('napture-0.23.0-x86_64-linux.rpm');
  });

  test('reports no installer when the release has nothing for the platform', () => {
    const result = buildUpdateCheckResult({
      releases: [makeRelease('0.23.0', { assets: [asset('latest-mac.yml')] })],
      channel: 'stable',
      currentVersion: '0.22.1',
      platform: 'linux',
      arch: 'x64'
    });

    expect(result.manual).toBe(true);
    expect(result.installer_url).toBeNull();
    expect(result.installer_name).toBeNull();
  });

  test('settings UI offers a download action instead of claiming no package exists', () => {
    const settingsSource = fs.readFileSync(path.resolve(__dirname, '../../napture/settings-ui.js'), 'utf8');
    expect(settingsSource).not.toContain('No automatic package for this platform');
    expect(settingsSource).toContain("dataset.action === 'download'");
    expect(settingsSource).toContain('naptureAPI.openExternal');
  });

  test('provides an absolute download url for an installable update bundle', () => {
    const result = buildUpdateCheckResult({
      releases: [makeRelease('0.23.0', { assets: [asset('napture-0.23.0-arm64-macos-update.zip')] })],
      channel: 'stable',
      currentVersion: '0.22.1',
      platform: 'darwin',
      arch: 'arm64'
    });

    expect(result.manual).toBe(false);
    expect(result.install_action).toBe('extract');
    expect(result.download_url).toMatch(/^https:\/\/github\.com\/.+\/releases\/download\//);
  });

  test.each([
    ['win32', 'x64', 'nsis', 'installer', 'napture-0.24.0-x64-windows.exe'],
    ['win32', 'arm64', 'nsis', 'installer', 'napture-0.24.0-arm64-windows.exe'],
    ['win32', 'x64', 'portable', 'portable', 'napture-0.24.0-x64-windows-portable.exe'],
    ['darwin', 'x64', 'mac', 'manual', 'napture-0.24.0-x64-macos.dmg'],
    ['darwin', 'arm64', 'mac', 'manual', 'napture-0.24.0-arm64-macos.dmg'],
    ['linux', 'x64', 'appimage', 'appimage', 'napture-0.24.0-x86_64-linux.AppImage'],
    ['linux', 'arm64', 'appimage', 'appimage', 'napture-0.24.0-arm64-linux.AppImage'],
    ['linux', 'x64', 'deb', 'manual', 'napture-0.24.0-amd64-linux.deb'],
    ['linux', 'x64', 'rpm', 'manual', 'napture-0.24.0-x86_64-linux.rpm'],
    ['linux', 'arm64', 'rpm', 'manual', 'napture-0.24.0-arm64-linux.rpm'],
    ['linux', 'x64', 'tar', 'manual', 'napture-0.24.0-x64-linux.tar.gz']
  ])('%s/%s install (%s) uses %s with %s', (platform, arch, installKind, action, name) => {
    const result = buildUpdateCheckResult({
      releases: [makeRelease('0.24.0', { assets: PLATFORM_ASSETS })],
      channel: 'stable',
      currentVersion: '0.23.0',
      platform,
      arch,
      installKind
    });

    expect(result.updateAvailable).toBe(true);
    expect(result.install_action).toBe(action);
    expect(result.installer_name).toBe(name);
    if (action === 'manual') {
      expect(result.download_url).toBeNull();
    } else {
      expect(result.download_url).toContain(name);
    }
  });

  test('a portable install falls back to the installer when no portable build ships', () => {
    const result = buildUpdateCheckResult({
      releases: [makeRelease('0.24.0', { assets: [asset('napture-0.24.0-x64-windows.exe')] })],
      channel: 'stable',
      currentVersion: '0.23.0',
      platform: 'win32',
      arch: 'x64',
      installKind: 'portable'
    });

    // Launching NSIS is fine; overwriting the portable .exe with it is not.
    expect(result.install_action).toBe('installer');
    expect(result.installer_name).toBe('napture-0.24.0-x64-windows.exe');
  });

  test('sandboxed Linux builds (snap/flatpak) are never handed a package', () => {
    const result = buildUpdateCheckResult({
      releases: [makeRelease('0.24.0', { assets: PLATFORM_ASSETS })],
      channel: 'stable',
      currentVersion: '0.23.0',
      platform: 'linux',
      arch: 'x64',
      installKind: 'sandbox'
    });

    expect(result.install_action).toBe('manual');
    expect(result.installer_url).toBeNull();
    expect(result.release_url).toContain('/releases');
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
