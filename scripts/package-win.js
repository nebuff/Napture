const { spawnSync } = require('child_process');
const path = require('path');

console.log('\n========================================');
console.log('   Napture Windows Binary Packager      ');
console.log('========================================\n');

console.log('Starting build for Windows (x64 and ARM64)...');
console.log('Bundling Napture UI and NEWEBX engine...\n');

const isWin = process.platform === 'win32';
const spawnBin = isWin ? 'cmd.exe' : 'npm';
const spawnArgs = isWin ? ['/c', 'npm', 'run', 'dist:win'] : ['run', 'dist:win'];

const result = spawnSync(spawnBin, spawnArgs, {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..')
});

if (result.status === 0) {
  console.log('\n[OK] Windows packaging completed successfully!');
  console.log('    Generated: Napture-Setup.exe and Napture-Portable.exe (x64 & ARM64)');
  console.log('    Output directory: dist/');
} else {
  console.error('\n[X] Windows packaging failed.');
  process.exit(result.status);
}
