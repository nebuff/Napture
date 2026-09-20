// Test suite for omnibar popup overlays and click dismissals
const fs = require('fs');
const path = require('path');

describe('Omnibar Popup WebContentsView Overlay (Downloads & History)', () => {
  const mainJsPath = path.join(__dirname, '../../napture/main.js');
  const preloadJsPath = path.join(__dirname, '../../napture/preload.js');
  const rendererJsPath = path.join(__dirname, '../../napture/renderer/renderer.js');
  const popupHtmlPath = path.join(__dirname, '../../napture/renderer/omnibar-popup.html');
  const popupJsPath = path.join(__dirname, '../../napture/renderer/omnibar-popup.js');

  let mainJsContent;
  let preloadJsContent;
  let rendererJsContent;
  let popupHtmlContent;
  let popupJsContent;

  beforeAll(() => {
    mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
    preloadJsContent = fs.readFileSync(preloadJsPath, 'utf8');
    rendererJsContent = fs.readFileSync(rendererJsPath, 'utf8');
    popupHtmlContent = fs.readFileSync(popupHtmlPath, 'utf8');
    popupJsContent = fs.readFileSync(popupJsPath, 'utf8');
  });

  describe('Overlay Files & Structure', () => {
    it('creates omnibar-popup.html with proper styles and containers', () => {
      expect(fs.existsSync(popupHtmlPath)).toBe(true);
      expect(popupHtmlContent).toContain('../newebx/chrome/userChrome.css');
      expect(popupHtmlContent).toContain('id="popup-container"');
      expect(popupHtmlContent).toContain('omnibar-popup.js');
    });

    it('creates omnibar-popup.js with controllers for downloads and history', () => {
      expect(fs.existsSync(popupJsPath)).toBe(true);
      expect(popupJsContent).toContain('window.showPopup');
      expect(popupJsContent).toContain('window.hidePopup');
      expect(popupJsContent).toContain('renderDownloadsView');
      expect(popupJsContent).toContain('renderHistoryView');
      expect(popupJsContent).toContain('setOmnibarPopupHeight');
      expect(popupJsContent).toContain('omnibarPopupAction');
    });
  });

  describe('Main Process Overlay Lifecycle & Z-Ordering', () => {
    it('defines initOmnibarPopupOverlay, showOmnibarPopup, and hideOmnibarPopup in main.js', () => {
      expect(mainJsContent).toContain('function initOmnibarPopupOverlay(');
      expect(mainJsContent).toContain('function showOmnibarPopup(');
      expect(mainJsContent).toContain('function hideOmnibarPopup(');
    });

    it('initializes omnibar popup overlay during window creation', () => {
      expect(mainJsContent).toMatch(/createWarmWindow[\s\S]*?initOmnibarPopupOverlay\(win,\s*state\)/);
      expect(mainJsContent).toMatch(/createBrowserWindow[\s\S]*?initOmnibarPopupOverlay\(win,\s*state\)/);
    });

    it('re-appends state.omnibarPopupView to win.contentView to ensure it renders above active webContents', () => {
      // In switch-tab
      expect(mainJsContent).toMatch(/ipcMain\.on\('switch-tab'[\s\S]*?win\.contentView\.addChildView\(state\.omnibarPopupView\)/);
      // In navigate
      expect(mainJsContent).toMatch(/ipcMain\.on\('navigate'[\s\S]*?win\.contentView\.addChildView\(state\.omnibarPopupView\)/);
    });

    it('includes state.omnibarPopupView in isExcludedView and getWindowFromWebContents', () => {
      expect(mainJsContent).toContain('state.omnibarPopupView && !state.omnibarPopupView.webContents.isDestroyed() && state.omnibarPopupView.webContents === contents');
      expect(mainJsContent).toContain('state.omnibarPopupView && !state.omnibarPopupView.webContents.isDestroyed() && state.omnibarPopupView.webContents === webContents');
    });

    it('dismisses omnibar popup on page-clicked, tab switch, and Escape', () => {
      expect(mainJsContent).toMatch(/ipcMain\.on\('page-clicked'[\s\S]*?hideOmnibarPopup\(win\)/);
      expect(mainJsContent).toMatch(/ipcMain\.on\('switch-tab'[\s\S]*?hideOmnibarPopup\(win\)/);
      expect(mainJsContent).toMatch(/key === 'Escape'[\s\S]*?hideOmnibarPopup\(focusedWindow\)/);
    });

    it('registers IPC handlers for toggle-omnibar-popup, hide-omnibar-popup, set-omnibar-popup-height, and omnibar-popup-action', () => {
      expect(mainJsContent).toContain("ipcMain.on('toggle-omnibar-popup'");
      expect(mainJsContent).toContain("ipcMain.on('hide-omnibar-popup'");
      expect(mainJsContent).toContain("ipcMain.on('set-omnibar-popup-height'");
      expect(mainJsContent).toContain("ipcMain.on('omnibar-popup-action'");
    });
  });

  describe('Preload Bridge Exposure', () => {
    it('exposes all omnibar overlay methods on window.naptureAPI', () => {
      expect(preloadJsContent).toContain('toggleOmnibarPopup:');
      expect(preloadJsContent).toContain('hideOmnibarPopup:');
      expect(preloadJsContent).toContain('setOmnibarPopupHeight:');
      expect(preloadJsContent).toContain('omnibarPopupAction:');
      expect(preloadJsContent).toContain('onOmnibarPopupAction:');
    });
  });

  describe('Renderer Integration', () => {
    it('calls window.naptureAPI.toggleOmnibarPopup on downloads and history button clicks', () => {
      expect(rendererJsContent).toMatch(/toggleOmnibarDownloadsPopup[\s\S]*?window\.naptureAPI\.toggleOmnibarPopup/);
      expect(rendererJsContent).toMatch(/toggleOmnibarHistoryPopup[\s\S]*?window\.naptureAPI\.toggleOmnibarPopup/);
    });

    it('dismisses overlay popup on click outside in renderer', () => {
      expect(rendererJsContent).toMatch(/document\.addEventListener\('click'[\s\S]*?window\.naptureAPI\.hideOmnibarPopup\(\)/);
    });

    it('handles actions from overlay popup via onOmnibarPopupAction', () => {
      expect(rendererJsContent).toContain('window.naptureAPI.onOmnibarPopupAction');
    });

    it('wires sidebar downloads button to toggleOmnibarDownloadsPopup', () => {
      expect(rendererJsContent).toMatch(/item\.id === 'downloads-btn'[\s\S]*?toggleOmnibarDownloadsPopup\(btn\)/);
    });

    it('loads self-contained data URL and applies right-click menu look in main.js', () => {
      expect(mainJsContent).toContain('data:text/html;charset=utf-8,');
      //
      //
      expect(mainJsContent).toContain('Show all downloads');
    });
  });
});
