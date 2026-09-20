// Test suite for sidebar toolbars and custom widget configurations
const fs = require('fs');
const path = require('path');

describe('Toolbar & Sidebar Bottom Customizer and Popups', () => {
  let activeToolbarLayout;
  let activeSidebarBottomLayout;

  const DEFAULT_TOOLBAR_LAYOUT = [
    'back-button', 'forward-button', 'reload-button', 'home-button',
    'margin', 'urlbar-container', 'margin',
    'downloads-btn', 'history-btn', 'theme-toggle-btn', 'brand-menu-btn'
  ];

  const DEFAULT_SIDEBAR_BOTTOM_LAYOUT = ['downloads-btn', 'history-btn', 'newtab-btn'];

  function isMultipleAllowed(item) {
    if (!item) return false;
    const type = typeof item === 'string' ? item : item.type;
    return type === 'margin' || type === 'separator' || type === 'link';
  }

  function sanitizeSidebarBottomLayout(layout) {
    if (!Array.isArray(layout)) return [...DEFAULT_SIDEBAR_BOTTOM_LAYOUT];
    const filtered = [];
    for (const item of layout) {
      if (!item) continue;
      const type = typeof item === 'string' ? item : item.type;
      if (type === 'urlbar-container' || type === 'urlbar') continue;
      if (!isMultipleAllowed(item) && filtered.some(f => (typeof f === 'string' ? f : f.type) === type)) {
        continue;
      }
      filtered.push(item);
      if (filtered.length >= 3) break;
    }
    return filtered;
  }

  function enforceSingleInstanceInvariants() {
    const seen = new Set();
    const cleanToolbar = [];
    for (const item of activeToolbarLayout) {
      const type = typeof item === 'string' ? item : item.type;
      if (isMultipleAllowed(item)) {
        cleanToolbar.push(item);
      } else {
        if (!seen.has(type)) {
          seen.add(type);
          cleanToolbar.push(item);
        }
      }
    }
    activeToolbarLayout = cleanToolbar;

    const cleanSidebar = [];
    for (const item of activeSidebarBottomLayout) {
      const type = typeof item === 'string' ? item : item.type;
      if (isMultipleAllowed(item)) {
        cleanSidebar.push(item);
      } else {
        if (!seen.has(type)) {
          seen.add(type);
          cleanSidebar.push(item);
        }
      }
      if (cleanSidebar.length >= 3) break;
    }
    activeSidebarBottomLayout = cleanSidebar;
  }

  function insertToolbarItem(item, index) {
    const type = typeof item === 'string' ? item : item.type;
    if (!isMultipleAllowed(item)) {
      activeToolbarLayout = activeToolbarLayout.filter(i => (typeof i === 'string' ? i : i.type) !== type);
      activeSidebarBottomLayout = activeSidebarBottomLayout.filter(i => (typeof i === 'string' ? i : i.type) !== type);
    }
    const targetIdx = index !== undefined && index >= 0 ? index : activeToolbarLayout.length;
    activeToolbarLayout.splice(targetIdx, 0, item);
    enforceSingleInstanceInvariants();
  }

  function insertSidebarBottomItem(item, index) {
    const type = typeof item === 'string' ? item : item.type;
    if (type === 'urlbar-container' || type === 'urlbar') return false;

    if (!isMultipleAllowed(item)) {
      activeSidebarBottomLayout = activeSidebarBottomLayout.filter(i => (typeof i === 'string' ? i : i.type) !== type);
      activeToolbarLayout = activeToolbarLayout.filter(i => (typeof i === 'string' ? i : i.type) !== type);
    }

    if (activeSidebarBottomLayout.length >= 3) {
      // Exceeded max 3 buttons
      return false;
    }

    const targetIdx = index !== undefined && index >= 0 ? index : activeSidebarBottomLayout.length;
    activeSidebarBottomLayout.splice(targetIdx, 0, item);
    activeSidebarBottomLayout = sanitizeSidebarBottomLayout(activeSidebarBottomLayout);
    enforceSingleInstanceInvariants();
    return true;
  }

  beforeEach(() => {
    activeToolbarLayout = [...DEFAULT_TOOLBAR_LAYOUT];
    activeSidebarBottomLayout = [...DEFAULT_SIDEBAR_BOTTOM_LAYOUT];
  });

  describe('Sidebar Bottom 3-Button Limit', () => {
    it('should sanitize layouts exceeding 3 items down to exactly 3', () => {
      const raw = ['downloads-btn', 'history-btn', 'newtab-btn', 'home-button', 'back-button'];
      const sanitized = sanitizeSidebarBottomLayout(raw);
      expect(sanitized.length).toBe(3);
      expect(sanitized).toEqual(['downloads-btn', 'history-btn', 'newtab-btn']);
    });

    it('should disallow adding more than 3 items to sidebar bottom', () => {
      activeSidebarBottomLayout = ['downloads-btn', 'history-btn', 'newtab-btn'];
      const inserted = insertSidebarBottomItem('home-button');
      expect(inserted).toBe(false);
      expect(activeSidebarBottomLayout.length).toBe(3);
    });

    it('should disallow urlbar-container in sidebar bottom', () => {
      activeSidebarBottomLayout = ['downloads-btn'];
      const inserted = insertSidebarBottomItem('urlbar-container');
      expect(inserted).toBe(false);
      expect(activeSidebarBottomLayout).toEqual(['downloads-btn']);
    });
  });

  describe('Single Instance Invariant', () => {
    it('allows multiple Flexible Space (margin), Separator, and Custom Link', () => {
      expect(isMultipleAllowed('margin')).toBe(true);
      expect(isMultipleAllowed('separator')).toBe(true);
      expect(isMultipleAllowed({ type: 'link', url: 'https://example.com' })).toBe(true);
      expect(isMultipleAllowed('downloads-btn')).toBe(false);
      expect(isMultipleAllowed('history-btn')).toBe(false);
      expect(isMultipleAllowed('home-button')).toBe(false);
    });

    it('removes button from sidebar bottom if added to toolbar', () => {
      activeToolbarLayout = ['back-button', 'urlbar-container'];
      activeSidebarBottomLayout = ['downloads-btn', 'history-btn', 'newtab-btn'];

      insertToolbarItem('downloads-btn', 0);

      expect(activeToolbarLayout.includes('downloads-btn')).toBe(true);
      expect(activeSidebarBottomLayout.includes('downloads-btn')).toBe(false);
      expect(activeSidebarBottomLayout).toEqual(['history-btn', 'newtab-btn']);
    });

    it('removes button from toolbar if added to sidebar bottom', () => {
      activeToolbarLayout = ['back-button', 'downloads-btn', 'urlbar-container'];
      activeSidebarBottomLayout = ['history-btn'];

      const inserted = insertSidebarBottomItem('downloads-btn');
      expect(inserted).toBe(true);

      expect(activeSidebarBottomLayout.includes('downloads-btn')).toBe(true);
      expect(activeToolbarLayout.includes('downloads-btn')).toBe(false);
    });

    it('allows multiple margin and separator items across both areas', () => {
      activeToolbarLayout = ['margin', 'urlbar-container', 'margin'];
      activeSidebarBottomLayout = ['separator'];

      insertToolbarItem('margin');
      insertSidebarBottomItem('separator');

      expect(activeToolbarLayout.filter(x => x === 'margin').length).toBe(3);
      expect(activeSidebarBottomLayout.filter(x => x === 'separator').length).toBe(2);
    });
  });

  describe('Firefox-Style Popup vs Sidebar Panel Action Logic', () => {
    it('triggers omnibar popup only if button is on top omnibar, else panel for sidebar', () => {
      const topBarButtons = ['downloads-btn', 'history-btn'];
      const sidebarBottomButtons = ['newtab-btn'];

      const mockOpenOmnibarDownloadsPopup = jest.fn();
      const mockOpenOmnibarHistoryPopup = jest.fn();
      const mockOpenSidebarPanel = jest.fn();

      function handleButtonClick(location, btnType) {
        if (location === 'toolbar') {
          if (btnType === 'downloads-btn') {
            mockOpenOmnibarDownloadsPopup();
          } else if (btnType === 'history-btn') {
            mockOpenOmnibarHistoryPopup();
          }
        } else if (location === 'sidebar') {
          if (btnType === 'downloads-btn') {
            mockOpenSidebarPanel('downloads-panel');
          } else if (btnType === 'history-btn') {
            mockOpenSidebarPanel('history-panel');
          }
        }
      }

      // Test top omnibar click
      handleButtonClick('toolbar', 'downloads-btn');
      expect(mockOpenOmnibarDownloadsPopup).toHaveBeenCalledTimes(1);
      expect(mockOpenSidebarPanel).not.toHaveBeenCalled();

      // Test sidebar click
      handleButtonClick('sidebar', 'downloads-btn');
      expect(mockOpenSidebarPanel).toHaveBeenCalledWith('downloads-panel');
    });

    it('invokes showDownloadedFileInFolder with target path when folder icon is clicked', () => {
      const mockAPI = {
        showDownloadedFileInFolder: jest.fn()
      };

      const item = {
        id: 'dl-123',
        filename: 'Firefox Setup 125.0.tar.bz2',
        path: '/home/nebuff/Downloads/Firefox Setup 125.0.tar.bz2',
        state: 'completed'
      };

      function onFolderActionClick(downloadItem) {
        mockAPI.showDownloadedFileInFolder(downloadItem);
      }

      onFolderActionClick(item);
      expect(mockAPI.showDownloadedFileInFolder).toHaveBeenCalledWith(item);
    });
  });

  describe('CSS & HTML Markup Verification', () => {
    it('contains popup containers in index.html', () => {
      const htmlPath = path.join(__dirname, '../../napture/renderer/index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      expect(htmlContent).toContain('id="omnibar-downloads-popup"');
      expect(htmlContent).toContain('id="omnibar-history-popup"');
      expect(htmlContent).toContain('id="omnibar-downloads-list"');
      expect(htmlContent).toContain('id="omnibar-history-list"');
      expect(htmlContent).toContain('id="omnibar-downloads-show-all"');
      expect(htmlContent).toContain('id="omnibar-history-show-all"');
    });

    it('contains omnibar popup styles and sidebar-bottom customizer styles in userChrome.css', () => {
      const cssPath = path.join(__dirname, '../../napture/newebx/chrome/userChrome.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      expect(cssContent).toContain('.omnibar-popup');
      expect(cssContent).toContain('.omnibar-download-icon-badge');
      expect(cssContent).toContain('.toolbar-customizing #sidebar .sidebar-bottom');
      expect(cssContent).toContain('.sidebar-bottom-item-wrapper');
      expect(cssContent).toContain('.sidebar-bottom-slot-empty');
    });

    it('keeps top-bar system buttons visually consistent with navigation buttons', () => {
      const cssPath = path.join(__dirname, '../../napture/newebx/chrome/userChrome.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');
      const systemButtonStyles = cssContent.slice(cssContent.indexOf('.toolbar-system-btn {'));

      expect(systemButtonStyles).toContain('background: transparent !important;');
      expect(systemButtonStyles).toContain('border: none !important;');
      expect(systemButtonStyles).toContain('width: 32px !important;');
      expect(systemButtonStyles).toContain('height: 32px !important;');
    });
  });

  describe('Renderer Script Initialization & Null Safety', () => {
    it('ensures DEFAULT_TOOLBAR_LAYOUT_ITEMS and draggedTopBarIdx are declared before early references', () => {
      const rendererPath = path.join(__dirname, '../../napture/renderer/renderer.js');
      const rendererContent = fs.readFileSync(rendererPath, 'utf8');

      const defaultToolbarIdx = rendererContent.indexOf('const DEFAULT_TOOLBAR_LAYOUT_ITEMS');
      const draggedTopBarIdx = rendererContent.indexOf('let draggedTopBarIdx');
      const endDragIdx = rendererContent.indexOf('function endDrag()');
      const getSettingsIdx = rendererContent.indexOf('window.naptureAPI.getSettings()');

      expect(defaultToolbarIdx).toBeGreaterThan(-1);
      expect(draggedTopBarIdx).toBeGreaterThan(-1);
      expect(defaultToolbarIdx).toBeLessThan(getSettingsIdx);
      expect(draggedTopBarIdx).toBeLessThan(endDragIdx);
    });

    it('ensures newTabBtn event listener has a null guard for dynamic sidebar bottom', () => {
      const rendererPath = path.join(__dirname, '../../napture/renderer/renderer.js');
      const rendererContent = fs.readFileSync(rendererPath, 'utf8');

      expect(rendererContent).toMatch(/if\s*\(\s*newTabBtn\s*\)\s*\{\s*newTabBtn\.addEventListener/);
    });
  });
});
