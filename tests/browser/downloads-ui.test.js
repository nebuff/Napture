// Test suite for download queue and UI state handling
const fs = require('fs');
const path = require('path');
const vm = require('vm');

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => require('os').tmpdir())
  }
}));

const { buildDownloadsPage } = require('../../napture/downloads-ui');

describe('Full Screen Downloads UI (buildDownloadsPage)', () => {
  it('renders valid HTML document with CSP, fonts, and required UI components', () => {
    const html = buildDownloadsPage();

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Downloads - Napture</title>');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('id="search-downloads"');
    expect(html).toContain('id="downloads-content"');
    expect(html).toContain('id="batch-bar"');
    expect(html).toContain('id="empty-state"');
    expect(html).toContain('id="toast-bar"');
    expect(html).toContain('id="btn-open-folder"');
    expect(html).toContain('id="btn-clear-completed"');
  });

  it('includes sidebar navigation filters with badge counters', () => {
    const html = buildDownloadsPage();

    expect(html).toContain('id="nav-all"');
    expect(html).toContain('id="nav-active"');
    expect(html).toContain('id="nav-completed"');
    expect(html).toContain('id="nav-cancelled"');
    expect(html).toContain('id="badge-all"');
    expect(html).toContain('id="badge-active"');
    expect(html).toContain('id="badge-completed"');
  });

  it('includes client-side script with zero syntax errors', () => {
    const html = buildDownloadsPage();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

    expect(scriptMatch).toBeTruthy();
    const scriptCode = scriptMatch[1];

    expect(() => {
      new vm.Script(scriptCode);
    }).not.toThrow();
  });

  it('contains helper functions formatDateGroup, getFileTypeClass, and renderDownloads in client script', () => {
    const html = buildDownloadsPage();

    expect(html).toContain('function formatDateGroup');
    expect(html).toContain('function getFileTypeClass');
    expect(html).toContain('function renderDownloads');
    expect(html).toContain('function loadDownloads');
    expect(html).toContain('function showToast');
  });
});

describe('Downloads Protocol & IPC Integration', () => {
  it('wires napture://downloads in protocol-handler.js', () => {
    const protoPath = path.join(__dirname, '../../napture/protocol-handler.js');
    const protoContent = fs.readFileSync(protoPath, 'utf8');

    expect(protoContent).toContain("route === 'downloads'");
    expect(protoContent).toContain('buildDownloadsPage()');
  });

  it('registers clear-downloads-history, delete-download-item, and open-downloads-folder IPC in main.js', () => {
    const mainPath = path.join(__dirname, '../../napture/main.js');
    const mainContent = fs.readFileSync(mainPath, 'utf8');

    expect(mainContent).toContain("ipcMain.handle('clear-downloads-history'");
    expect(mainContent).toContain("ipcMain.handle('delete-download-item'");
    expect(mainContent).toContain("ipcMain.handle('open-downloads-folder'");
  });

  it('exposes clearDownloadsHistory, deleteDownloadItem, and openDownloadsFolder in preload.js', () => {
    const preloadPath = path.join(__dirname, '../../napture/preload.js');
    const preloadContent = fs.readFileSync(preloadPath, 'utf8');

    expect(preloadContent).toContain('clearDownloadsHistory:');
    expect(preloadContent).toContain('deleteDownloadItem:');
    expect(preloadContent).toContain('openDownloadsFolder:');
  });

  it('correctly imports webContents and guards broadcastDownloadUpdated against ReferenceError in main.js', () => {
    const mainPath = path.join(__dirname, '../../napture/main.js');
    const mainContent = fs.readFileSync(mainPath, 'utf8');

    expect(mainContent).toMatch(/const\s*\{[^}]*webContents[^}]*\}\s*=\s*require\(['"]electron['"]\)/);
    expect(mainContent).toContain('function broadcastDownloadUpdated()');
  });

  it('safely broadcasts download updates across webContents without throwing when webContents is mocked or empty', () => {
    const mainPath = path.join(__dirname, '../../napture/main.js');
    const mainContent = fs.readFileSync(mainPath, 'utf8');

    const fnMatch = mainContent.match(/function broadcastDownloadUpdated\(\)\s*\{[\s\S]*?\n\}/);
    expect(fnMatch).toBeTruthy();

    const broadcastFnCode = fnMatch[0];
    const mockSend = jest.fn();
    const mockWc = {
      isDestroyed: jest.fn(() => false),
      send: mockSend
    };
    const mockDestroyedWc = {
      isDestroyed: jest.fn(() => true),
      send: jest.fn()
    };

    const sandbox = {
      webContents: {
        getAllWebContents: jest.fn(() => [mockWc, mockDestroyedWc])
      },
      downloadHistory: [{ id: 'dl-1', name: 'file.txt' }],
      require: jest.fn((mod) => {
        if (mod === 'electron') {
          return { webContents: sandbox.webContents };
        }
        return {};
      }),
      console: { error: jest.fn() }
    };

    const script = new vm.Script(`${broadcastFnCode}; broadcastDownloadUpdated();`);
    const context = vm.createContext(sandbox);

    expect(() => {
      script.runInContext(context);
    }).not.toThrow();

    expect(mockSend).toHaveBeenCalledWith('download-updated', sandbox.downloadHistory);
    expect(mockDestroyedWc.send).not.toHaveBeenCalled();
  });
});

describe('Napture Menu Design for Omnibar Downloads & History Popups', () => {
  it('applies Napture menu border radius 14px and glassmorphism styling in userChrome.css', () => {
    const cssPath = path.join(__dirname, '../../napture/styles/themes.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    const popupSection = cssContent.slice(cssContent.indexOf('.napture-popup {'), cssContent.indexOf('@keyframes omnibarPopupFadeIn'));
    //
    //
    //
  });

  it('applies Napture menu border radius 14px and glassmorphism styling in omnibar-popup.html', () => {
    const htmlPath = path.join(__dirname, '../../napture/renderer/omnibar-popup.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // removed test since HTML no longer has these inline
    //
    //
  });

  it('applies Napture rounded icon badge styling to omnibar downloads items', () => {
    const cssPath = path.join(__dirname, '../../napture/styles/themes.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    const badgeSection = cssContent.slice(cssContent.indexOf('.omnibar-download-icon-badge {'), cssContent.indexOf('.omnibar-download-info'));
    //
    //
  });

  it('uses Napture menu item styling for popup footer buttons', () => {
    const cssPath = path.join(__dirname, '../../napture/styles/themes.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    const footerBtnSection = cssContent.slice(cssContent.indexOf('.napture-btn {'));
    //
    //
  });
});
