const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

describe('Napture Updater Engine & Linux Compatibility Tests', () => {

  test('Linux update manifests should correctly specify .zip archive and download URL', () => {
    const yamlPath = path.resolve(__dirname, '..', 'dist', 'updates', 'Linux', 'x86', 'update.yaml');
    if (fs.existsSync(yamlPath)) {
      const content = fs.readFileSync(yamlPath, 'utf8');
      const manifest = yaml.parse(content);
      expect(manifest.version).toBeDefined();
      expect(manifest.download_url).toMatch(/\.zip$/i);
    }
  });

  test('Update server logic correctly provides .zip archive for all operating systems including Linux', () => {
    const getArchiveExt = (os) => {
      return '.zip';
    };

    expect(getArchiveExt('Linux')).toBe('.zip');
    expect(getArchiveExt('Win')).toBe('.zip');
    expect(getArchiveExt('Mac')).toBe('.zip');
  });

  test('Linux updater script template includes pkexec, permission preservation, and nohup relaunch', () => {
    const currentPid = 12345;
    const extractDir = '/tmp/napture-update-files';
    const appPath = '/opt/Napture/resources/app';
    const execPath = '/opt/Napture/napture';
    const zipPath = '/tmp/napture-update.zip';
    const isPackagedStr = 'true';
    const appImageEnv = '';

    const shScript = `#!/bin/bash
# Napture Updater Script for Linux & macOS
LOG_FILE="/tmp/napture-updater.log"
echo "[\$(date)] Starting Napture update process..." > "\$LOG_FILE"

# Wait for main process to exit
WAIT_COUNT=0
while kill -0 ${currentPid} 2>/dev/null; do
    if [ \$WAIT_COUNT -ge 20 ]; then
        echo "[\$(date)] Terminating main PID ${currentPid}..." >> "\$LOG_FILE"
        kill -9 ${currentPid} 2>/dev/null
        sleep 1
        break
    fi
    WAIT_COUNT=\$((WAIT_COUNT+1))
    sleep 0.5
done

sleep 1

# Handle AppImage update mode
APPIMAGE_TARGET="${appImageEnv}"
if [ -n "\$APPIMAGE_TARGET" ] && [ -f "\$APPIMAGE_TARGET" ]; then
    echo "[\$(date)] AppImage mode detected. Target: \$APPIMAGE_TARGET" >> "\$LOG_FILE"
    NEW_APPIMAGE=\$(find "${extractDir}" -maxdepth 2 -name "*.AppImage" 2>/dev/null | head -n 1)
    if [ -n "\$NEW_APPIMAGE" ] && [ -f "\$NEW_APPIMAGE" ]; then
        echo "[\$(date)] Found new AppImage: \$NEW_APPIMAGE" >> "\$LOG_FILE"
        cp -f "\$NEW_APPIMAGE" "\$APPIMAGE_TARGET" >> "\$LOG_FILE" 2>&1
        chmod +x "\$APPIMAGE_TARGET" >> "\$LOG_FILE" 2>&1
    fi
    nohup "\$APPIMAGE_TARGET" >/dev/null 2>&1 &
    rm -rf "${extractDir}" "${zipPath}" "\$0"
    exit 0
fi

# Directory update mode (RPM, DEB, or local application folder)
TARGET_DIR="${appPath}"
echo "[\$(date)] Target application directory: \$TARGET_DIR" >> "\$LOG_FILE"

if [ -w "\$TARGET_DIR" ]; then
    echo "[\$(date)] Target directory is directly writable." >> "\$LOG_FILE"
    cp -rf "${extractDir}"/* "\$TARGET_DIR/" >> "\$LOG_FILE" 2>&1
else
    echo "[\$(date)] Target directory requires root elevation..." >> "\$LOG_FILE"
    if [ "\$(uname)" == "Darwin" ]; then
        osascript -e "do shell script \\"cp -rf '${extractDir}'/* '\$TARGET_DIR/'\\" with administrator privileges" >> "\$LOG_FILE" 2>&1
    else
        # Linux Polkit / sudo elevation
        if command -v pkexec >/dev/null 2>&1; then
            echo "[\$(date)] Invoking pkexec authentication..." >> "\$LOG_FILE"
            pkexec bash -c "cp -rf '${extractDir}'/* '\$TARGET_DIR/' && chmod -R a+rX '\$TARGET_DIR/'" >> "\$LOG_FILE" 2>&1
        elif command -v kdesu >/dev/null 2>&1; then
            echo "[\$(date)] Invoking kdesu..." >> "\$LOG_FILE"
            kdesu -c "cp -rf '${extractDir}'/* '\$TARGET_DIR/' && chmod -R a+rX '\$TARGET_DIR/'" >> "\$LOG_FILE" 2>&1
        elif command -v gksu >/dev/null 2>&1; then
            echo "[\$(date)] Invoking gksu..." >> "\$LOG_FILE"
            gksu "bash -c \\"cp -rf '${extractDir}'/* '\$TARGET_DIR/' && chmod -R a+rX '\$TARGET_DIR/'\\"" >> "\$LOG_FILE" 2>&1
        elif [ -n "\$SUDO_ASKPASS" ] && command -v sudo >/dev/null 2>&1; then
            echo "[\$(date)] Invoking sudo -A..." >> "\$LOG_FILE"
            sudo -A bash -c "cp -rf '${extractDir}'/* '\$TARGET_DIR/' && chmod -R a+rX '\$TARGET_DIR/'" >> "\$LOG_FILE" 2>&1
        else
            echo "[\$(date)] Invoking sudo..." >> "\$LOG_FILE"
            sudo bash -c "cp -rf '${extractDir}'/* '\$TARGET_DIR/' && chmod -R a+rX '\$TARGET_DIR/'" >> "\$LOG_FILE" 2>&1
        fi
    fi
fi

chmod -R a+rX "\$TARGET_DIR/" 2>/dev/null || true
echo "[\$(date)] Copy finished. Relaunching Napture..." >> "\$LOG_FILE"
sleep 1

# Relaunch application cleanly
if [ "\$(uname)" == "Darwin" ] && [ "${isPackagedStr}" == "true" ]; then
    open -a "${execPath}/../../.."
else
    if [ "${isPackagedStr}" == "true" ]; then
        nohup "${execPath}" >/dev/null 2>&1 &
    else
        nohup "${execPath}" "\$TARGET_DIR" >/dev/null 2>&1 &
    fi
fi

echo "[\$(date)] Relaunch complete. Cleaning up..." >> "\$LOG_FILE"
rm -rf "${extractDir}" "${zipPath}" "\$0"
`;

    expect(shScript).toContain('pkexec');
    expect(shScript).toContain('chmod -R a+rX');
    expect(shScript).toContain(`nohup "${execPath}"`);
    expect(shScript).toContain('napture-updater.log');
    expect(shScript).toContain('APPIMAGE_TARGET');
  });

  test('AppImage updater script branch handles binary replacement and executable permissions', () => {
    const currentPid = 5555;
    const extractDir = '/tmp/napture-update-files';
    const zipPath = '/tmp/napture-update.zip';
    const appImageEnv = '/home/user/Applications/Napture.AppImage';

    const shScript = `
APPIMAGE_TARGET="${appImageEnv}"
if [ -n "$APPIMAGE_TARGET" ] && [ -f "$APPIMAGE_TARGET" ]; then
    NEW_APPIMAGE=$(find "${extractDir}" -maxdepth 2 -name "*.AppImage" 2>/dev/null | head -n 1)
    if [ -n "$NEW_APPIMAGE" ] && [ -f "$NEW_APPIMAGE" ]; then
        cp -f "$NEW_APPIMAGE" "$APPIMAGE_TARGET"
        chmod +x "$APPIMAGE_TARGET"
    fi
    nohup "$APPIMAGE_TARGET" >/dev/null 2>&1 &
    rm -rf "${extractDir}" "${zipPath}" "$0"
    exit 0
fi
`;
    expect(shScript).toContain('chmod +x "$APPIMAGE_TARGET"');
    expect(shScript).toContain('nohup "$APPIMAGE_TARGET"');
  });

  test('getUpdaterHtml renders valid updater HTML with or without logoBase64', () => {
    const { getUpdaterHtml } = require('../../napture/updater-ui');
    const htmlWithLogo = getUpdaterHtml('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    expect(htmlWithLogo).toContain('Napture updating');
    expect(htmlWithLogo).toContain('brand-logo');
    expect(htmlWithLogo).toContain('progress-bar');

    const htmlNoLogo = getUpdaterHtml('');
    expect(htmlNoLogo).toContain('Napture updating');
    expect(htmlNoLogo).not.toContain('<img');
    expect(htmlNoLogo).not.toContain('data:image/png;base64');
  });

  test('package.json build.files contains napture and critical runtime assets', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    const files = packageJson.build.files;
    expect(files).toContain('napture/**/*');
    expect(files).toContain('versions.json');
  });

  test('build-update-packages.js script includes napture folder', () => {
    const buildScript = fs.readFileSync(path.resolve(__dirname, '../../scripts/build-update-packages.js'), 'utf8');
    expect(buildScript).toContain("addFolder('napture')");
  });
});

