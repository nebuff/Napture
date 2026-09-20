const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('\n========================================');
console.log('   Napture macOS Binary Packager      ');
console.log('========================================\n');

console.log('Starting build for macOS (dmg & zip, ARM64 & x64)...');
console.log('Bundling Napture UI and NEWEBX engine for Apple Silicon and Intel Macs...\n');

const isWin = process.platform === 'win32';
const spawnBin = isWin ? 'cmd.exe' : 'npm';
const spawnArgs = isWin ? ['/c', 'npm', 'run', 'dist:mac'] : ['run', 'dist:mac'];

const result = spawnSync(spawnBin, spawnArgs, {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  env: process.env
});

if (result.status === 0) {
  const rootDir = path.resolve(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');

  // If on macOS, verify and ensure ad-hoc signatures on all generated .app bundles
  if (process.platform === 'darwin') {
    console.log('\n[*] Verifying and securing macOS bundle code signatures...');
    try {
      const appDirs = [];
      const searchDirs = [distDir, path.join(distDir, 'mac'), path.join(distDir, 'mac-arm64')];
      
      for (const sDir of searchDirs) {
        if (fs.existsSync(sDir)) {
          const entries = fs.readdirSync(sDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && entry.name.endsWith('.app')) {
              appDirs.push(path.join(sDir, entry.name));
            }
          }
        }
      }

      for (const appPath of appDirs) {
        console.log(`  • Validating code signature: ${path.relative(rootDir, appPath)}`);
        try {
          execSync(`codesign --force --deep -s - "${appPath}"`, { stdio: 'inherit' });
          execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'ignore' });
          console.log(`    ✔ Signature verified for ${path.basename(appPath)}`);
        } catch (signErr) {
          console.warn(`    [!] Warning: codesign check returned:`, signErr.message);
        }
      }
    } catch (e) {
      console.warn('  [!] Non-fatal error during codesign verification:', e.message);
    }
  }

  console.log('\n[OK] macOS packaging completed successfully!');
  console.log('    Generated artifacts in dist/');
} else {
  console.error('\n[X] macOS packaging failed.');
  process.exit(result.status || 1);
}

