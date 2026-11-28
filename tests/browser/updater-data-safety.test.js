const fs = require('fs');
const os = require('os');
const path = require('path');

// Point Electron at a throwaway profile so these tests exercise exactly the
// code path the packaged app uses without touching a real user's data.
let mockUserDataPath = '';
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name) => (name === 'userData' ? mockUserDataPath : ''))
  }
}));

const history = require('../../napture/db/history');

const REPO_ROOT = path.resolve(__dirname, '../..');
const mainSource = fs.readFileSync(path.join(REPO_ROOT, 'napture/main.js'), 'utf8');

// Everything that runs for an update: install-kind detection, the update check,
// the download and the platform specific apply steps.
function updaterSource() {
  const start = mainSource.indexOf('// How this copy was installed decides');
  const end = mainSource.indexOf('// --- End Auto Updater Logic ---');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return mainSource.slice(start, end);
}

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = mainSource.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const after = mainSource.slice(start + marker.length);
  // Stop at whatever top-level construct follows the function body.
  const stops = ['\nfunction ', '\nipcMain.handle(', '\n// ---']
    .map((stop) => after.indexOf(stop))
    .filter((index) => index !== -1);
  const end = stops.length > 0 ? Math.min(...stops) : after.length;
  return after.slice(0, end);
}

function installUpdateSource() {
  const start = mainSource.indexOf("ipcMain.handle('install-update'");
  const end = mainSource.indexOf('// --- End Auto Updater Logic ---', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return mainSource.slice(start, end);
}

describe('the profile database survives an update', () => {
  beforeEach(() => {
    mockUserDataPath = path.join(
      os.tmpdir(),
      `napture-update-safety-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    fs.mkdirSync(mockUserDataPath, { recursive: true });
    history.initDB();
  });

  afterEach(() => {
    history.closeDB();
    try {
      fs.rmSync(mockUserDataPath, { recursive: true, force: true });
    } catch (e) {}
  });

  test('bookmarks, settings and history are still there after the relaunch an update performs', () => {
    history.addBookmark('Docs', 'https://docs.example.com');
    history.addBookmark('Work', 'https://work.example.com');
    history.setSetting('bookmarks_tree', [{ type: 'link', title: 'Docs', url: 'https://docs.example.com' }]);
    history.setSetting('theme', 'dark');
    history.addHistory('https://visited.example.com', 'Visited', '');

    // The updater quits the old build and starts the new one: same profile dir,
    // same history.db. This is what that restart looks like to the DB layer.
    history.closeDB();
    history.initDB();

    const urls = history.getBookmarks().map((bookmark) => bookmark.url);
    expect(urls).toEqual(expect.arrayContaining(['https://docs.example.com', 'https://work.example.com']));
    expect(history.getSetting('theme', '')).toBe('dark');
    expect(history.getSetting('bookmarks_tree', [])).toHaveLength(1);
    expect(history.searchHistory('visited.example.com', 10)).toHaveLength(1);
  });

  test('opening the database again is additive and never drops rows', () => {
    history.addBookmark('Keep me', 'https://keep.example.com');
    for (let i = 0; i < 3; i++) history.initDB();
    expect(history.getBookmarks().map((bookmark) => bookmark.title)).toContain('Keep me');
  });

  test('the schema only creates tables, it never drops them', () => {
    const dbSource = fs.readFileSync(path.join(REPO_ROOT, 'napture/db/history.js'), 'utf8');
    expect(dbSource).toMatch(/CREATE TABLE IF NOT EXISTS bookmarks/);
    expect(dbSource).toMatch(/CREATE TABLE IF NOT EXISTS settings/);
    expect(dbSource).toMatch(/CREATE TABLE IF NOT EXISTS history/);
    expect(dbSource).not.toMatch(/DROP TABLE/i);
  });

  test('the database lives in userData, so a new build finds the same file', () => {
    expect(fs.existsSync(path.join(mockUserDataPath, 'history.db'))).toBe(true);
    // Re-initialising must reuse that file rather than starting a new one.
    history.initDB();
    const dbFiles = fs.readdirSync(mockUserDataPath).filter((name) => /^history\.db/.test(name));
    expect(dbFiles.filter((name) => name === 'history.db')).toHaveLength(1);
  });
});

describe('the updater never touches the browser profile', () => {
  test('the update path opens no database and clears no browser data', () => {
    const section = updaterSource();
    expect(section).not.toMatch(/require\(['"]\.\/db\/history['"]\)/);
    expect(section).not.toMatch(/\binitDB\s*\(/);
    expect(section).not.toMatch(/\b(clearAllBookmarks|resetAllData|clearAllHistory|clearAllSessions|resetAllSettings)\b/);
    expect(section).not.toMatch(/clearStorageData|clearAuthCache|localStorage\.clear|session\.clearCache/);
    expect(section).not.toMatch(/DROP TABLE/i);
  });

  test('the only files the updater deletes are its own temp files', () => {
    const removals = updaterSource()
      .split('\n')
      .filter((line) => /\b(rmSync|unlinkSync|fs\.unlink)\s*\(/.test(line));

    // The zip flow cleans up after itself, so there is at least one removal.
    expect(removals.length).toBeGreaterThan(0);
    for (const line of removals) {
      expect(line).toMatch(/extractDir|zipPath|filePath|scriptPath|tempDir/i);
      expect(line).not.toMatch(/userData|history\.db|Application Support|Library/i);
    }
  });

  test('install-update writes only into the temp directory', () => {
    const install = installUpdateSource();
    expect(install).toContain("app.getPath('temp')");
    expect(install).not.toContain("app.getPath('userData')");
    expect(install).not.toMatch(/rmSync\([^)]*userData/i);
  });

  test('the AppImage swap only rewrites the AppImage and relaunches it', () => {
    const body = functionSource('replaceAppImage');
    expect(body).toContain('cp -f "$NEW" "$TARGET" && chmod +x "$TARGET"');
    expect(body).toContain('nohup "$TARGET"');
    expect(body).not.toMatch(/history\.db|Application Support|userData|Library/i);
  });

  test('the portable swap only moves the new executable over the old one', () => {
    const body = functionSource('replacePortableExecutable');
    expect(body).toContain('move /y "%NEW%" "%TARGET%"');
    expect(body).toContain('start "" "%TARGET%"');
    expect(body).not.toMatch(/history\.db|Application Support|userData|Library/i);
  });

  test('the Windows installer hand-off deletes nothing', () => {
    expect(functionSource('launchInstaller')).not.toMatch(/rmSync|unlink|rmdir|\.rm\(/);
  });

  test('every automatic update action is wired to its implementation', () => {
    const install = installUpdateSource();
    expect(install).toContain("if (action === 'appimage') replaceAppImage(filePath);");
    expect(install).toContain("else if (action === 'portable') replacePortableExecutable(filePath);");
    expect(install).toContain('else launchInstaller(filePath);');
  });
});

describe('nothing clears data on quit or between versions', () => {
  test('quitting only saves the session and destroys windows', () => {
    const start = mainSource.indexOf("app.on('before-quit'");
    const end = mainSource.indexOf("app.on('window-all-closed'", start);
    expect(start).toBeGreaterThan(-1);

    const beforeQuit = mainSource.slice(start, end);
    expect(beforeQuit).toContain('saveCurrentSessionFromMain');
    expect(beforeQuit).not.toMatch(/clearAllBookmarks|clearAllHistory|resetAllData|resetAllSettings|DELETE FROM/i);
  });

  test('the profile directory name cannot drift between releases', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    // Electron builds the default userData path from productName || name, so a
    // rename (or a new root-level productName) would point every existing user
    // at an empty profile after an update.
    expect(pkg.name).toBe('napture');
    expect(pkg.productName).toBeUndefined();
  });

  test('the reset action is the only thing in the main process that wipes the DB', () => {
    const resetCalls = mainSource.match(/\bresetAllData\s*\(/g) || [];
    expect(resetCalls).toHaveLength(1);
    expect(mainSource).toContain("ipcMain.handle('reset-all-data'");
  });
});
