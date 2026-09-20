const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

console.log('\n========================================');
console.log('   Napture (NEWEBX) Engine Updater      ');
console.log('========================================\n');

console.log('Updating Napture (NEWEBX) Engine Core & Chromium Framework to latest upstream releases...\n');

const rootDir = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const npmBin = isWin ? 'npm.cmd' : 'npm';

function fetchJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 8000, headers: { 'User-Agent': 'Napture-Engine-Updater/1.0' } }, (res) => {
      if (res.statusCode !== 200) return resolve(null);
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function resolveUpstreamChromiumVersion() {
  try {
    const data = await fetchJson('https://versionhistory.googleapis.com/v1/chrome/platforms/linux/channels/stable/versions');
    if (data && Array.isArray(data.versions) && data.versions.length > 0) {
      const topVer = data.versions[0].version;
      if (topVer) {
        console.log(`[Auto-Detect] Detected latest upstream Google Chrome stable release: ${topVer}`);
        return topVer;
      }
    }
  } catch (err) {
    // fallback
  }

  try {
    const data = await fetchJson('https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Linux');
    if (Array.isArray(data) && data.length > 0 && data[0].version) {
      console.log(`[Auto-Detect] Detected latest upstream Google Chrome stable release: ${data[0].version}`);
      return data[0].version;
    }
  } catch (err) {
    // fallback
  }

  return null;
}

async function resolveTargetElectron() {
  // 1. Check releases.electronjs.org for releases
  try {
    const releases = await fetchJson('https://releases.electronjs.org/releases.json');
    if (Array.isArray(releases) && releases.length > 0) {
      // Find non-nightly releases
      const nonNightly = releases.filter(r => !r.version.includes('nightly'));
      if (nonNightly.length > 0) {
        const topRelease = nonNightly[0];
        console.log(`[Auto-Detect] Detected latest upstream Electron release: ${topRelease.version} (Chromium ${topRelease.chrome})`);
        return `electron@${topRelease.version}`;
      }
    }
  } catch (err) {
    console.warn('[!] Notice: Could not query electronjs.org releases:', err.message);
  }

  // 2. Query npm view dist-tags
  try {
    const tagsRaw = execSync(`${npmBin} view electron dist-tags --json`, {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
      cwd: rootDir
    });
    const tags = JSON.parse(tagsRaw);
    if (tags.beta && tags.latest) {
      const betaMajor = parseInt(tags.beta, 10);
      const latestMajor = parseInt(tags.latest, 10);
      if (betaMajor > latestMajor) {
        console.log(`[Auto-Detect] Detected newer Electron release branch: ${tags.beta}`);
        return `electron@${tags.beta}`;
      }
      return `electron@${tags.latest}`;
    }
    if (tags.latest) {
      return `electron@${tags.latest}`;
    }
  } catch (err) {
    console.warn('[!] Notice: Could not query npm dist-tags:', err.message);
  }

  // 3. Fallback
  return 'electron@latest';
}

function formatNewebxEngineVersion(chromeVer, fallbackElectronVer = '44.0.0') {
  if (chromeVer && typeof chromeVer === 'string') {
    const parts = chromeVer.trim().split('.');
    if (parts.length >= 4) {
      const major = parts[0];
      const patch = parts[3];
      return `v0.9b${major}${patch}`;
    } else if (parts.length >= 1 && parts[0]) {
      return `v0.9b${parts.join('')}`;
    }
  }
  return `v0.9b${String(fallbackElectronVer).replace(/\./g, '')}`;
}

async function main() {
  const upstreamChromeVer = await resolveUpstreamChromiumVersion();
  const targetElectron = await resolveTargetElectron();
  console.log(`\n[1/3] Updating Electron Chromium runtime packages (${targetElectron})...`);
  
  const spawnBin = isWin ? 'cmd.exe' : 'npm';
  const spawnArgs = isWin ? ['/c', 'npm', 'install', targetElectron, '--save-dev'] : ['install', targetElectron, '--save-dev'];
  
  const result = spawnSync(spawnBin, spawnArgs, {
    stdio: 'inherit',
    cwd: rootDir
  });

  if (result.status !== 0) {
    console.error('\n[X] Failed to update Electron runtime packages.');
    process.exit(result.status);
  }

  console.log('\n[2/3] Updating versions metadata in versions.json...');
  try {
    const electronPkgPath = path.join(rootDir, 'node_modules', 'electron', 'package.json');
    let electronVer = 'latest';
    if (fs.existsSync(electronPkgPath)) {
      const epkg = JSON.parse(fs.readFileSync(electronPkgPath, 'utf8'));
      electronVer = epkg.version || 'latest';
    }

    const versionsPath = path.join(rootDir, 'versions.json');
    let currentVersions = { napture: '0.18.5', newebxEngine: 'v0.9b15264' };
    if (fs.existsSync(versionsPath)) {
      currentVersions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
    }
    if (upstreamChromeVer) {
      currentVersions.chromiumVersion = upstreamChromeVer;
    }
    fs.writeFileSync(versionsPath, JSON.stringify(currentVersions, null, 2), 'utf8');
    const naptureVersionsPath = path.join(rootDir, 'napture', 'versions.json');
    if (fs.existsSync(path.dirname(naptureVersionsPath))) {
      fs.writeFileSync(naptureVersionsPath, JSON.stringify(currentVersions, null, 2), 'utf8');
    }
    console.log(`[OK] Updated newebxEngine version to ${currentVersions.newebxEngine} (Electron ${electronVer}, Chromium ${currentVersions.chromiumVersion || 'latest'})`);
  } catch (err) {
    console.warn('[!] Notice: Could not update versions.json:', err.message);
  }

  console.log('\n[3/3] Synchronizing Native Chromium CEF Framework distribution...');
  try {
    const buildNativeScript = path.join(__dirname, 'build-native-engine.js');
    if (fs.existsSync(buildNativeScript)) {
      const nativeRes = spawnSync(process.execPath, [buildNativeScript], {
        stdio: 'inherit',
        cwd: rootDir
      });
      if (nativeRes.status === 0) {
        console.log('[OK] Native Chromium CEF distribution is synchronized.');
      } else {
        console.warn('[!] Native CEF sync exited with status:', nativeRes.status);
      }
    }
  } catch (err) {
    console.warn('[!] Notice: Native CEF engine setup error:', err.message);
  }

  console.log('\n======================================================');
  console.log(' [OK] NEWEBX & Chromium Framework update complete!   ');
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('[X] Engine updater error:', err);
  process.exit(1);
});
