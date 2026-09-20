// Napture Update & Installer Packager
// Generates delta updates (update.zip) and standalone installers for all platforms.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const readline = require('readline');

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
        // ignore
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

function getWslLinuxTargets() {
    if (!canBuildInWsl()) {
        return [];
    }

    const targets = [];
    if (wslHasCommand('dpkg-deb') && wslHasCommand('fpm')) targets.push('deb');
    if (wslHasCommand('flatpak')) targets.push('flatpak');
    if (wslHasCommand('appimagetool') || wslHasCommand('mksquashfs')) targets.push('AppImage');
    if (wslHasCommand('rpmbuild')) targets.push('rpm');
    return targets;
}

function toWslPath(winPath) {
    return winPath.replace(/^([A-Za-z]):\\/, (_, drive) => `/mnt/${drive.toLowerCase()}/`).replace(/\\/g, '/');
}

const yaml = require('yaml');
const AdmZip = require('adm-zip');

const versionsPath = path.resolve(__dirname, '../versions.json');
const packageJsonPath = path.resolve(__dirname, '../package.json');

let version = '0.18.1';
let naptureVersion = '0.18.1';
let newebxVersion = 'v0.9b4400';
let enableNeProtocol = true;
let enableBlurBackground = false;

if (fs.existsSync(versionsPath)) {
    try {
        const loaded = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
        if (loaded.napture) {
            naptureVersion = String(loaded.napture).trim();
            version = naptureVersion.replace(/^v/, '');
        }
        if (loaded.newebxEngine) {
            newebxVersion = String(loaded.newebxEngine).trim();
        } else if (loaded.newebChromium) {
            newebxVersion = String(loaded.newebChromium).trim();
        }
        if (loaded.enableNeProtocol !== undefined) {
            enableNeProtocol = loaded.enableNeProtocol !== false;
        }
        if (loaded.enableBlurBackground !== undefined) {
            enableBlurBackground = loaded.enableBlurBackground !== false;
        }
    } catch (e) {
        console.warn('Warning: Failed to parse versions.json, checking package.json:', e);
    }
}

if (fs.existsSync(packageJsonPath)) {
    try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (!naptureVersion && pkg.version) {
            naptureVersion = pkg.version;
            version = pkg.version.replace(/^v/, '');
        }
        // Ensure package.json has the clean semver version
        const cleanVer = (naptureVersion || version).replace(/^v/, '');
        if (pkg.version !== cleanVer) {
            pkg.version = cleanVer;
            fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
            console.log(`Synchronized package.json version to: ${cleanVer}`);
        }
    } catch (e) {
        console.warn('Warning: Failed to sync package.json:', e);
    }
}

const updatesDir = path.resolve(__dirname, '../dist/updates');
const releaseNotesPath = path.resolve(__dirname, '../RELEASE_NOTES.md');

function calculateSHA256(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
}

async function promptReleaseNotes() {
    // Check if --notes arg is passed
    const notesArgIndex = process.argv.indexOf('--notes');
    if (notesArgIndex !== -1 && process.argv.length > notesArgIndex + 1) {
        const notes = process.argv[notesArgIndex + 1];
        fs.writeFileSync(releaseNotesPath, notes, 'utf8');
        return notes;
    }

    if (fs.existsSync(releaseNotesPath)) {
        console.log(`Found existing RELEASE_NOTES.md. Using its content.`);
        return fs.readFileSync(releaseNotesPath, 'utf8');
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        console.log("\n=================================");
        console.log("Enter release notes for this update.");
        console.log("Type 'EOF' on a new line to finish.");
        console.log("=================================\n");

        let notes = "";
        rl.on('line', (line) => {
            if (line.trim() === 'EOF') {
                rl.close();
                fs.writeFileSync(releaseNotesPath, notes.trim(), 'utf8');
                resolve(notes.trim());
            } else {
                notes += line + "\n";
            }
        });
    });
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function copyFile(src, dest) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

function copyFolderRecursive(src, dest) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyFolderRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function createUpdateManifest(targetDir, os, arch, zipPath, releaseNotes) {
    const archiveName = path.basename(zipPath);
    const manifest = {
        version: version,
        napture_version: naptureVersion,
        newebx_version: newebxVersion,
        release_date: new Date().toISOString().split('T')[0],
        release_notes: (typeof releaseNotes === 'string') ? releaseNotes.trim() : 'Routine update',
        download_url: `/api/v1/download/${os}/${arch}/${archiveName}`,
        sha256: calculateSHA256(zipPath),
        min_supported_version: "0.1.0"
    };

    const yamlStr = yaml.stringify(manifest);
    fs.writeFileSync(path.join(targetDir, 'update.yaml'), yamlStr, 'utf8');
    console.log(`Generated update.yaml for ${os}/${arch}`);
}

async function main() {
    console.log("Starting Napture Update Packager...\n");
    
    const releaseNotes = await promptReleaseNotes();
    console.log("\nRelease Notes captured:\n" + releaseNotes + "\n");

    const npmBin = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';

    try {
        console.log("\n1. Packaging application files for updates...");

        // Let's create the updates directory structure
        ensureDir(updatesDir);

        const platforms = [
            { os: 'Win', arch: 'x86' },
            { os: 'Win', arch: 'arm' },
            { os: 'Linux', arch: 'x86' },
            { os: 'Linux', arch: 'arm' },
            { os: 'Mac', arch: 'x86' },
            { os: 'Mac', arch: 'arm' }
        ];

        for (const p of platforms) {
            const targetDir = path.join(updatesDir, p.os, p.arch);
            const distDir = path.join(targetDir, 'dist');
            
            // Clean and ensure directories
            if (fs.existsSync(distDir)) {
                fs.rmSync(distDir, { recursive: true, force: true });
            }
            ensureDir(distDir);

            const archiveName = 'update.zip';
            const archivePath = path.join(targetDir, archiveName);

            const addFile = (file) => {
                const src = path.resolve(__dirname, '..', file);
                if (fs.existsSync(src)) {
                    copyFile(src, path.join(distDir, file));
                }
            };
            const addFolder = (folder) => {
                const src = path.resolve(__dirname, '..', folder);
                if (fs.existsSync(src)) {
                    copyFolderRecursive(src, path.join(distDir, folder));
                }
            };

            // Napture Application Package & Subdirectories
            addFolder('napture');

            // Assets & Manifests
            addFile('versions.json');
            addFile('package.json');

            // Zip the generated dist folder
            const zip = new AdmZip();
            zip.addLocalFolder(distDir);
            zip.writeZip(archivePath);
            console.log(`Created zip package: ${archivePath}`);

            createUpdateManifest(targetDir, p.os, p.arch, archivePath, releaseNotes);
        }

        console.log("\n3. Building application installers...");

        const rootDistDir = path.resolve(__dirname, '../dist');

        if (fs.existsSync(rootDistDir)) {
            for (const entry of fs.readdirSync(rootDistDir)) {
                if (entry === 'updates') continue;
                fs.rmSync(path.join(rootDistDir, entry), { recursive: true, force: true });
            }
        }

        const buildTmpDir = path.join(process.env.HOME || '/tmp', '.cache', 'napture-build-tmp');
        ensureDir(buildTmpDir);
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

        const buildWindows = () => {
            console.log("\nBuilding Windows binaries (x64 and ARM64)...");
            spawnSync(npmBin, ['run', 'dist:win'], { stdio: 'inherit', shell: true, env: customEnv });

            const winX86Dir = path.join(updatesDir, 'Win', 'x86');
            const winArmDir = path.join(updatesDir, 'Win', 'arm');
            ensureDir(winX86Dir);
            ensureDir(winArmDir);

            if (fs.existsSync(rootDistDir)) {
                const files = fs.readdirSync(rootDistDir);
                for (const file of files) {
                    if (file === 'updates') continue;
                    const src = path.join(rootDistDir, file);
                    if (!fs.existsSync(src) || fs.statSync(src).isDirectory()) continue;

                    if (file.endsWith('.exe')) {
                        const isArm = file.toLowerCase().includes('arm');
                        const targetDir = isArm ? winArmDir : winX86Dir;

                        // Normalize filename to napture-<version>-<arch>-windows.<ext>
                        let targetFileName = file;
                        let ext = path.extname(file);
                        let baseName = path.basename(file, ext);
                        let arch = isArm ? 'arm64' : 'x86_64';
                        if (baseName.toLowerCase().includes('portable')) {
                            targetFileName = `napture-${version}-${arch}-windows-portable${ext}`;
                        } else {
                            targetFileName = `napture-${version}-${arch}-windows${ext}`;
                        }

                        const dest = path.join(targetDir, targetFileName);
                        fs.copyFileSync(src, dest);
                        console.log(`Copied Windows ${isArm ? 'ARM' : 'x86'} installer ${file} -> ${targetFileName} to: ${dest}`);
                    }

                    if (file.startsWith('latest') && (file.endsWith('.yml') || file.endsWith('.yaml')) && !file.includes('mac') && !file.includes('linux')) {
                        const isArm = /arm64|arm/i.test(file);
                        const targetDir = isArm ? winArmDir : winX86Dir;
                        copyFile(src, path.join(targetDir, file));
                        if (isArm && file !== 'latest.yml') {
                            copyFile(src, path.join(targetDir, 'latest.yml'));
                        }
                        console.log(`Copied Windows ${isArm ? 'ARM' : 'x86'} update manifest ${file} to: ${targetDir}`);
                    }
                }
            }
        };

        const buildLinux = () => {
            console.log("\nBuilding Linux binaries (x86 and ARM)...");
            if (process.platform === 'win32' && isWSLAvailable()) {
                let targets = getWslLinuxTargets();
                if (targets.length > 0) {
                    const wslPath = toWslPath(path.resolve(__dirname, '..'));
                    if (wslPath.startsWith('/mnt/') && targets.includes('AppImage')) {
                        console.log('  • Running on a mounted Windows path in WSL; skipping AppImage packaging to avoid symlink permission failures.');
                        targets = targets.filter(target => target !== 'AppImage');
                    }
                    if (targets.length > 0) {
                        const wslCommand = `cd \"${wslPath}\" && npm run compile && npx electron-builder --linux ${targets.join(' ')} --x64 --arm64`;
                        console.log(`  • Using WSL to build Linux packages: ${targets.join(', ')}.`);
                        const result = spawnSync('wsl.exe', ['bash', '-lc', wslCommand], { stdio: 'inherit', env: customEnv });
                        if (result.error || result.status !== 0) {
                            console.log('  • WSL Linux package build failed, falling back to tar.gz packaging on Windows.');
                            spawnSync(npmBin, ['run', 'compile'], { stdio: 'inherit', shell: true, env: customEnv });
                            const electronBuilderBin = path.resolve(__dirname, '..', 'node_modules', '.bin', 'electron-builder.cmd');
                            spawnSync(electronBuilderBin, ['--linux', 'tar.gz', '--x64', '--arm64'], { stdio: 'inherit', cwd: path.resolve(__dirname, '..'), env: customEnv });
                        }
                    } else {
                        const missing = getWslMissingTools();
                        console.log(`  • WSL is available but missing required tools: ${missing.join(', ')}.`);
                        console.log('  • Falling back to tar.gz packaging on Windows.');
                        spawnSync(npmBin, ['run', 'compile'], { stdio: 'inherit', shell: true, env: customEnv });
                        const electronBuilderBin = path.resolve(__dirname, '..', 'node_modules', '.bin', 'electron-builder.cmd');
                        spawnSync(electronBuilderBin, ['--linux', 'tar.gz', '--x64', '--arm64'], { stdio: 'inherit', cwd: path.resolve(__dirname, '..'), env: customEnv });
                    }
                }
            } else if (process.platform === 'win32') {
                console.log("  • WSL not detected; building tar.gz only on Windows.");
                spawnSync(npmBin, ['run', 'compile'], { stdio: 'inherit', shell: true, env: customEnv });
                const electronBuilderBin = path.resolve(__dirname, '..', 'node_modules', '.bin', 'electron-builder.cmd');
                spawnSync(electronBuilderBin, ['--linux', 'tar.gz', '--x64', '--arm64'], { stdio: 'inherit', cwd: path.resolve(__dirname, '..'), env: customEnv });
            } else {
                spawnSync(npmBin, ['run', 'dist:linux'], { stdio: 'inherit', shell: true, env: customEnv });
            }

            const linuxX86Dir = path.join(updatesDir, 'Linux', 'x86');
            const linuxArmDir = path.join(updatesDir, 'Linux', 'arm');
            ensureDir(linuxX86Dir);
            ensureDir(linuxArmDir);

            if (fs.existsSync(rootDistDir)) {
                const files = fs.readdirSync(rootDistDir);
                for (const file of files) {
                    if (file === 'updates') continue;
                    const src = path.join(rootDistDir, file);
                    if (!fs.existsSync(src) || fs.statSync(src).isDirectory()) continue;

                    const isLinuxPkg = file.endsWith('.deb') || file.endsWith('.AppImage') || file.endsWith('.rpm') || file.endsWith('.flatpak') || file.endsWith('.snap') || file.endsWith('.tar.gz');
                    if (isLinuxPkg) {
                        const isArm = /arm64|aarch64|armv7l|arm/i.test(file);
                        const targetDir = isArm ? linuxArmDir : linuxX86Dir;

                        let ext = file.endsWith('.tar.gz') ? '.tar.gz' : path.extname(file);
                        let arch = isArm ? (file.endsWith('.rpm') ? 'aarch64' : 'arm64') : 'x86_64';
                        let osName = 'linux';
                        if (file.endsWith('.rpm')) {
                            osName = 'fedora';
                        } else if (file.endsWith('.deb')) {
                            osName = 'ubuntu';
                        } else if (file.endsWith('.flatpak')) {
                            osName = 'flatpak';
                        } else if (file.endsWith('.snap')) {
                            osName = 'snap';
                        }
                        const targetFileName = `napture-${version}-${arch}-${osName}${ext.toLowerCase()}`;

                        const dest = path.join(targetDir, targetFileName);
                        fs.copyFileSync(src, dest);
                        console.log(`Copied Linux ${isArm ? 'ARM' : 'x86'} package ${file} -> ${targetFileName} to: ${dest}`);
                    }

                    if (file.startsWith('latest-linux') && (file.endsWith('.yml') || file.endsWith('.yaml'))) {
                        const isArm = /arm64|arm/i.test(file);
                        const targetDir = isArm ? linuxArmDir : linuxX86Dir;
                        copyFile(src, path.join(targetDir, file));
                        if (isArm && file !== 'latest-linux.yml') {
                            copyFile(src, path.join(targetDir, 'latest-linux.yml'));
                        }
                        console.log(`Copied Linux ${isArm ? 'ARM' : 'x86'} update manifest ${file} to: ${targetDir}`);
                    }
                }
            }
        };

        const buildMac = () => {
            console.log("\nBuilding macOS binaries (x64 and ARM64)...");
            spawnSync(npmBin, ['run', 'dist:mac'], { stdio: 'inherit', shell: true, env: customEnv });

            const macX86Dir = path.join(updatesDir, 'Mac', 'x86');
            const macArmDir = path.join(updatesDir, 'Mac', 'arm');
            ensureDir(macX86Dir);
            ensureDir(macArmDir);

            if (fs.existsSync(rootDistDir)) {
                const files = fs.readdirSync(rootDistDir);
                for (const file of files) {
                    if (file === 'updates') continue;
                    const src = path.join(rootDistDir, file);
                    if (!fs.existsSync(src) || fs.statSync(src).isDirectory()) continue;

                    if (file.endsWith('.dmg') || file.endsWith('.zip') || file.endsWith('.pkg')) {
                        const isArm = /arm64|m1|silicon/i.test(file);
                        const targetDir = isArm ? macArmDir : macX86Dir;

                        let ext = path.extname(file);
                        let arch = isArm ? 'arm64' : 'x86_64';
                        const targetFileName = `napture-${version}-${arch}-macos${ext.toLowerCase()}`;

                        const dest = path.join(targetDir, targetFileName);
                        fs.copyFileSync(src, dest);
                        console.log(`Copied macOS ${isArm ? 'ARM' : 'x86'} package ${file} -> ${targetFileName} to: ${dest}`);
                    }

                    if (file.startsWith('latest-mac') && (file.endsWith('.yml') || file.endsWith('.yaml'))) {
                        const isArm = /arm64|arm/i.test(file);
                        const targetDir = isArm ? macArmDir : macX86Dir;
                        copyFile(src, path.join(targetDir, file));
                        if (isArm && file !== 'latest-mac.yml') {
                            copyFile(src, path.join(targetDir, 'latest-mac.yml'));
                        }
                        console.log(`Copied macOS ${isArm ? 'ARM' : 'x86'} update manifest ${file} to: ${targetDir}`);
                    }
                }
            }
        };

        if (process.platform === 'win32') {
            buildWindows();
            buildLinux();
        } else if (process.platform === 'darwin') {
            buildMac();
        } else {
            // Linux host: build Windows and Linux binaries locally
            buildWindows();
            buildLinux();
            console.log('\n[i] Note: Production macOS binaries (DMG/ZIP) must be built on macOS (e.g. via GitHub Actions macos-latest runner) to ensure proper ad-hoc codesigning and Mach-O bundle structure. Skipping local Linux Mac cross-compilation.');
        }

        // Synchronize site release.yaml if sync_releases script exists
        try {
            const syncReleaseYaml = require('../site/sync_releases.js');
            const siteReleaseYamlPath = path.resolve(__dirname, '../site/release.yaml');
            syncReleaseYaml(updatesDir, siteReleaseYamlPath);
            console.log('\nSynchronized site/release.yaml with latest update packages.');
        } catch (e) {
            // ignore if site sync script is not available
        }

        console.log("\n===============================================");
        console.log("   Update packages & installers built successfully!");
        console.log(`   Location: ${updatesDir}`);
        console.log("===============================================\n");
    } catch (err) {
        console.error("Build failed:", err);
        throw err;
    }
}

main().catch(err => console.error(err));

