// Package Napture for Linux distributions (.AppImage, .deb, .rpm, .tar.gz)
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function isWSLAvailable() {
  if (process.platform !== 'win32') return false;
  try {
    const res = spawnSync('wsl.exe', ['-l', '-q'], { stdio: 'ignore' });
    return res.status === 0;
  } catch (e) {
    return false;
  }
}

function wslHasCommand(cmd) {
  try {
    const res = spawnSync('wsl.exe', ['bash', '-lc', `command -v ${cmd}`], { stdio: 'pipe' });
    return res.status === 0 && res.stdout.toString().trim().length > 0;
  } catch (e) {
    return false;
  }
}

function getWslCommand(cmd) {
  const winCmdMap = {
    node: '/mnt/c/Program Files/nodejs/node.exe',
    npm: '/mnt/c/Program Files/nodejs/npm',
    npx: '/mnt/c/Program Files/nodejs/npx'
  };

  try {
    const res = spawnSync('wsl.exe', ['bash', '-lc', `command -v ${cmd}`], { stdio: 'pipe' });
    if (res.status === 0 && res.stdout.toString().trim().length > 0) {
      return cmd;
    }
  } catch (e) {
    // ignore error
  }

  const mapped = winCmdMap[cmd];
  if (!mapped) return null;

  try {
    const res = spawnSync('wsl.exe', ['bash', '-lc', `test -x "${mapped}"`], { stdio: 'ignore' });
    if (res.status === 0) {
      return mapped;
    }
  } catch (e) {
    return null;
  }

  return null;
}

function canBuildInWsl() {
  return !!getWslCommand('node') && !!getWslCommand('npm') && !!getWslCommand('npx');
}

function getWslMissingTools() {
  const missing = [];
  if (!getWslCommand('node')) missing.push('node');
  if (!getWslCommand('npm')) missing.push('npm');
  if (!getWslCommand('npx')) missing.push('npx');
  if (!wslHasCommand('flatpak')) missing.push('flatpak');
  if (!wslHasCommand('appimagetool') && !wslHasCommand('mksquashfs')) missing.push('appimagetool or mksquashfs');
  if (!wslHasCommand('dpkg-deb')) missing.push('dpkg-deb');
  if (!wslHasCommand('fpm')) missing.push('fpm');
  if (!wslHasCommand('rpmbuild')) missing.push('rpmbuild');
  return missing;
}

function toWslPath(winPath) {
  return winPath.replace(/^([A-Za-z]):\\/, (_, drive) => `/mnt/${drive.toLowerCase()}/`).replace(/\\/g, '/');
}

function getWslLinuxTargets() {
  if (!canBuildInWsl()) {
    return [];
  }

  const targets = [];
  if (wslHasCommand('flatpak')) targets.push('flatpak');
  if (wslHasCommand('appimagetool') || wslHasCommand('mksquashfs')) targets.push('AppImage');
  if (wslHasCommand('dpkg-deb') && wslHasCommand('fpm')) targets.push('deb');
  if (wslHasCommand('rpmbuild')) targets.push('rpm');
  return targets;
}

console.log('\n========================================');
console.log('   Napture Linux Binary Packager        ');
console.log('========================================\n');

console.log('Starting build for Linux x86 (x64) & ARM (arm64)...');
console.log('Bundling Napture for Wayland, X11, Fedora, Ubuntu, Debian, Arch, openSUSE...\n');

const isWin = process.platform === 'win32';
const electronBuilderBin = path.resolve(__dirname, '..', 'node_modules', '.bin', isWin ? 'electron-builder.cmd' : 'electron-builder');

function cleanTmpDirs() {
  try {
    const tmpBase = '/tmp';
    if (fs.existsSync(tmpBase)) {
      const entries = fs.readdirSync(tmpBase);
      for (const entry of entries) {
        if (entry.startsWith('flatpak-bundler-') || entry.startsWith('electron-download-')) {
          try {
            fs.rmSync(path.join(tmpBase, entry), { recursive: true, force: true });
          } catch (e) {
            // ignore
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

let result = { status: 0 };
if (isWin && isWSLAvailable()) {
  let targets = getWslLinuxTargets();
  if (targets.length > 0) {
    const wslPath = toWslPath(path.resolve(__dirname, '..'));
    if (wslPath.startsWith('/mnt/') && targets.includes('AppImage')) {
      console.log('  • Running on a mounted Windows path in WSL; skipping AppImage packaging to avoid symlink permission issues.');
      targets = targets.filter(target => target !== 'AppImage');
    }
    const wslCommand = `cd \"${wslPath}\" && npx electron-builder --linux ${targets.join(' ')} --x64 && npx electron-builder --linux ${targets.join(' ')} --arm64`;
    console.log(`  • Using WSL to build Linux packages: ${targets.join(', ')}.`);
    result = spawnSync('wsl.exe', ['bash', '-lc', wslCommand], { stdio: 'inherit' });
  } else {
    const missing = getWslMissingTools();
    console.log(`  • WSL is available but missing optional tools: ${missing.join(', ')}.`);
    console.log('  • Building tar.gz on Windows.');
    result = spawnSync(electronBuilderBin, ['--linux', 'tar.gz', '--x64', '--arm64'], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });
  }
} else if (isWin) {
  console.log('  • WSL not detected; building tar.gz on Windows.');
  result = spawnSync(electronBuilderBin, ['--linux', 'tar.gz', '--x64', '--arm64'], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });
} else {
  cleanTmpDirs();
  const buildTmpDir = path.join(process.env.HOME || '/tmp', '.cache', 'napture-build-tmp');
  if (!fs.existsSync(buildTmpDir)) {
    fs.mkdirSync(buildTmpDir, { recursive: true });
  }
  const localLib = path.join(process.env.HOME || '', '.local', 'lib');
  const localBin = path.join(process.env.HOME || '', '.local', 'bin');
  const customEnv = {
    ...process.env,
    TMPDIR: buildTmpDir,
    TMP: buildTmpDir,
    TEMP: buildTmpDir,
    PATH: `${localBin}:${process.env.PATH || ''}`,
    LD_LIBRARY_PATH: `${localLib}:${process.env.LD_LIBRARY_PATH || ''}`
  };

  console.log('Packaging Linux x64 binaries...');
  const x64Res = spawnSync(electronBuilderBin, ['--linux', '--x64', '--publish', 'never'], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    env: customEnv
  });

  if (x64Res.status !== 0) {
    result = x64Res;
  } else {
    console.log('\nPackaging Linux ARM64 binaries...');
    const arm64Res = spawnSync(electronBuilderBin, ['--linux', '--arm64', '--publish', 'never'], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
      env: customEnv
    });
    result = arm64Res;
  }
  cleanTmpDirs();
}

if (result.status === 0) {
  console.log('\n[OK] Linux packaging completed successfully!');
  console.log('    Generated target packages:');
  console.log('      • .AppImage (Universal standalone executable)');
  console.log('      • .deb      (Debian, Ubuntu, Mint, Pop!_OS)');
  console.log('      • .rpm      (Fedora, RHEL, CentOS, openSUSE)');
  console.log('      • .tar.gz   (Universal archive)');
  console.log('    Output directory: dist/');
} else {
  console.error('\n[X] Linux packaging failed.');
  process.exit(result.status || 1);
}
