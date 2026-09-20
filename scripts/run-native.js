const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const isWin = process.platform === 'win32';
const binName = isWin ? 'napture-native.exe' : 'napture-native';

const possiblePaths = [
  path.resolve(__dirname, '..', 'napture', 'build', 'native', 'Release', binName),
  path.resolve(__dirname, '..', 'napture', 'build', 'native', 'Debug', binName),
  path.resolve(__dirname, '..', 'napture', 'build', 'native', binName),
  path.resolve(__dirname, '..', 'build', 'native', 'Release', binName),
  path.resolve(__dirname, '..', 'build', 'native', 'Debug', binName),
  path.resolve(__dirname, '..', 'build', 'native', binName)
];

let binaryPath = possiblePaths.find(p => fs.existsSync(p));

if (!binaryPath) {
  console.error(`[Napture Native Runner] Executable '${binName}' not found in build directories.`);
  console.log('Please build the native engine first:');
  console.log('  1. npm run build:native');
  console.log('  2. cmake -B build/native -S src/native');
  console.log('  3. cmake --build build/native --config Release');
  process.exit(1);
}

console.log(`[Napture Native Runner] Launching ${binaryPath}...`);
const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..')
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
