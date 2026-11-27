const fs = require('fs');
const path = require('path');

jest.mock('better-sqlite3', () => function() {
  return { exec: jest.fn(), prepare: () => ({ get: jest.fn(() => null), all: jest.fn(() => []), run: jest.fn() }) };
}, { virtual: true });

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => require('os').tmpdir()) }
}));

const { buildSettingsPage } = require('../../napture/settings-ui');

const rootDir = path.resolve(__dirname, '../..');

describe('Browser import data-type selection', () => {
  it('renders Bookmarks, History and Cookies selectors in the import section', () => {
    const html = buildSettingsPage();
    expect(html).toContain('id="import-type-bookmarks"');
    expect(html).toContain('id="import-type-history"');
    expect(html).toContain('id="import-type-cookies"');
    expect(html).toContain('> Bookmarks</label>');
    expect(html).toContain('> History</label>');
    expect(html).toContain('> Cookies</label>');
  });

  it('passes the selection to the import IPC call', () => {
    const html = buildSettingsPage();
    expect(html).toContain('importBrowserData(browser, types)');
    expect(html).toContain('Select at least one thing to import');
  });

  it('forwards the selection from both preloads', () => {
    const preload = fs.readFileSync(path.join(rootDir, 'napture/preload.js'), 'utf8');
    const tabPreload = fs.readFileSync(path.join(rootDir, 'napture/tab-preload.js'), 'utf8');
    expect(preload).toContain("importBrowserData: (browser, types) => ipcRenderer.invoke('import-browser-data', browser, types)");
    expect(tabPreload).toContain("importBrowserData: (browser, types) => ipcRenderer.invoke('import-browser-data', browser, types)");
  });

  it('honours the selection and imports cookies in the main process', () => {
    const main = fs.readFileSync(path.join(rootDir, 'napture/main.js'), 'utf8');
    expect(main).toContain("ipcMain.handle('import-browser-data', async (event, browserName, options)");
    expect(main).toContain('const wantCookies = requestedTypes.cookies === true');
    expect(main).toContain('if (wantBookmarks) {');
    expect(main).toContain('for (const hPath of (wantHistory ? historyPaths : []))');
    expect(main).toContain('decryptChromiumCookieValue');
    expect(main).toContain('importedCookiesCount');
  });

  it('wires the icon assets used by the installers', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    expect(pkg.build.icon).toBe('napture/build/icons/512x512.png');
    expect(pkg.build.win.icon).toBe('napture/build/icon.ico');
    expect(pkg.build.mac.icon).toBe('napture/build/icon.icns');
    expect(pkg.build.linux.icon).toBe('napture/build/icons');
    expect(fs.existsSync(path.join(rootDir, pkg.build.win.icon))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, pkg.build.mac.icon))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, pkg.build.linux.icon, '512x512.png'))).toBe(true);
  });
});
